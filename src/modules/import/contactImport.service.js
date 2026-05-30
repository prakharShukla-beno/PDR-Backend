import fs from "fs";
import { processContactFile } from "../../common/utils/contactFileParser.js";
import contactRepository from "../contacts/contact.repository.js";
import Contact from "../contacts/contact.model.js";
import importLogRepository from "../importLog/importLog.repository.js";
import notificationService from "../notification/notification.service.js";
import auditLogService from "../auditLog/auditLog.service.js";
import Prospect from "../prospect/prospect.model.js";
import duplicateRepository from "../duplicate/duplicate.repository.js";

const CHUNK_SIZE = 1000;

// Extract denormalized account fields
const extractAccountFields = (prospect) => ({
  accountIndustry:      prospect.primaryIndustry  || null,
  accountCountry:       prospect.country           || null,
  accountCity:          prospect.hqLocationCity    || null,
  accountEmployees:     prospect.noOfEmployees     || null,
  accountRevenue:       prospect.annualRevenue     || null,
  accountBusinessModel: prospect.businessModel     || null,
  accountSalesPriority: prospect.salesPriority     || null,
  accountClvRanking:    prospect.clvRanking        || null,
  accountTechFitScore:  prospect.techFitScore      || null,
  accountIntentSignal:  prospect.intentSignal      || null,
  accountWebsite:       prospect.website           || null,
});

// Safe bulk insert
const safeInsertMany = async (docs, chunkNum) => {
  if (!docs || docs.length === 0) return 0;
  try {
    await Contact.insertMany(docs, { ordered: false });
    console.log(`✅ Chunk ${chunkNum}: ${docs.length} contacts inserted`);
    return docs.length;
  } catch (err) {
    if (err.name === "BulkWriteError" || err.code === 11000) {
      const inserted = err.result?.nInserted ?? err.result?.insertedCount ?? 0;
      console.warn(`⚠️ Chunk ${chunkNum}: ${inserted}/${docs.length} inserted`);
      return inserted;
    }
    console.error(`❌ Chunk ${chunkNum} error:`, err.message);
    return 0;
  }
};

const contactImportService = {

  // ==========================================================================
  // CONTACT IMPORT — Step 1
  // Non-duplicates save, duplicates user ko wapas bhejo
  // Duplicate = same email already exists in DB
  // ==========================================================================
  processContactImport: async (filePath, userId) => {

    const { validRows, errorDetails, totalRows } = processContactFile(filePath);

    console.log(`📊 Total: ${totalRows}, Valid: ${validRows.length}, Errors: ${errorDetails.length}`);

    const importLog = await importLogRepository.create({
      fileName:     filePath.split(/[\\\/]/).pop(),
      importType:   "excel",
      uploadedBy:   userId,
      totalRows,
      successCount: 0,
      failedCount:  errorDetails.length,
      errorDetails,
      status:       "processing",
    });

    if (!validRows || validRows.length === 0) {
      await importLogRepository.update(importLog._id, { status: "failed", failedCount: errorDetails.length });
      try { fs.unlinkSync(filePath); } catch (_) {}
      return { importLogId: importLog._id, totalRows, successCount: 0, failedCount: errorDetails.length, duplicates: [], errorDetails, status: "failed" };
    }

    // Find existing contacts by email (duplicate check)
    const emails = validRows.map(r => r.email?.toLowerCase().trim()).filter(Boolean);
    const existingContacts = emails.length > 0
      ? await Contact.find({ email: { $in: emails } })
          .select("_id email firstName lastName standardizedRoles functionalDomain accountName accountIndustry primaryPhone linkedIn")
          .lean()
      : [];

    const existingEmailMap = {};
    for (const c of existingContacts) {
      if (c.email) existingEmailMap[c.email.toLowerCase()] = c;
    }

    // Get account map for linking
    const uniqueAccountNames = [...new Set(validRows.map(r => r.accountName?.trim()).filter(Boolean))];
    const accountMap = {};

    if (uniqueAccountNames.length > 0) {
      const accounts = await Prospect.find({
        accountNameLower: { $in: uniqueAccountNames.map(n => n.toLowerCase()) },
      }).select("_id accountName accountNameLower primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal website").lean();

      for (const acc of accounts) {
        if (acc.accountNameLower) accountMap[acc.accountNameLower] = acc;
      }
    }

    // Separate new contacts from duplicates
    const newRows       = [];
    const duplicateRows = [];

    for (const row of validRows) {
      const emailKey  = row.email?.toLowerCase().trim();
      const isDuplicate = emailKey && existingEmailMap[emailKey];

      const nameKey   = row.accountName?.trim().toLowerCase();
      const prospect  = nameKey ? accountMap[nameKey] : null;
      const accountFields = prospect ? extractAccountFields(prospect) : {};

      const preparedRow = {
        ...row,
        accountId:   prospect ? prospect._id : null,
        accountName: row.accountName?.trim() || null,
        isLinked:    !!prospect,
        ...accountFields,
        source:      filePath.toLowerCase().endsWith(".csv") ? "csv" : "excel",
        importLogId: importLog._id,
      };

      if (isDuplicate) {
        // Save to duplicate collection for review on Duplicates page
        await duplicateRepository.create({
          prospectId1: existingEmailMap[emailKey]._id,
          entityType:  "Contact",   // ← Contact duplicate hai
          newData:     preparedRow,
          matchFields: ["email"],
          source:      "import",
          importLogId: importLog._id,
          status:      "pending",
        });
        duplicateRows.push({
          newData:      preparedRow,
          existingData: existingEmailMap[emailKey],
          matchFields:  ["email"],
        });
      } else {
        newRows.push(preparedRow);
      }
    }

    console.log(`📦 New: ${newRows.length} | Duplicates: ${duplicateRows.length}`);

    // Insert new contacts
    let successCount = 0;
    const insertErrors = [];

    for (let i = 0; i < newRows.length; i += CHUNK_SIZE) {
      const chunk    = newRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      const inserted = await safeInsertMany(chunk, chunkNum);
      successCount  += inserted;
      if (inserted < chunk.length) insertErrors.push(`Chunk ${chunkNum}: ${chunk.length - inserted} rows failed`);
      await importLogRepository.update(importLog._id, { successCount });
    }

    const allErrors     = [...errorDetails, ...insertErrors];
    const hasDuplicates = duplicateRows.length > 0;
    const finalStatus   =
      successCount === 0 && !hasDuplicates ? "failed"  :
      hasDuplicates                        ? "partial" :
      successCount < newRows.length        ? "partial" :
      "completed";

    await importLogRepository.update(importLog._id, {
      successCount,
      failedCount:  allErrors.length,
      errorDetails: allErrors,
      status:       finalStatus,
    });

    try { fs.unlinkSync(filePath); } catch (_) {}

    await auditLogService.log({
      userId,
      action:      "IMPORT",
      entity:      "Import",
      entityId:    importLog._id,
      description: `Contact import — ${successCount} saved, ${duplicateRows.length} duplicates need review`,
    });

    console.log(`🏁 Contact import — ${successCount} saved | ${duplicateRows.length} duplicates pending`);

    return {
      importLogId:   importLog._id,
      totalRows,
      successCount,
      failedCount:   allErrors.length,
      duplicates:    duplicateRows,
      hasDuplicates,
      errorDetails:  allErrors,
      status:        finalStatus,
    };
  },

  // ==========================================================================
  // RESOLVE CONTACT DUPLICATES — Step 2
  // Actions: merge | skip | keep_both
  // ==========================================================================
  resolveContactDuplicates: async ({ importLogId, decisions, userId }) => {
    const results = { merged: 0, skipped: 0, kept_both: 0, errors: [] };

    for (const decision of decisions) {
      const { existingId, newData, action } = decision;

      try {
        if (action === "skip") {
          // Keep existing, ignore new
          results.skipped++;

        } else if (action === "merge") {
          // Update existing contact with new data (only fill empty fields)
          const updateData = {};
          const mergeFields = [
            "standardizedRoles", "functionalDomain", "keyFocusAreas",
            "primaryPhone", "secondaryPhone", "primaryMobNo",
            "linkedIn", "twitterUrl", "country", "state", "city", "timeZone",
            "accountId", "accountName", "accountIndustry", "accountCountry",
            "accountSalesPriority", "accountClvRanking", "isLinked",
          ];

          for (const field of mergeFields) {
            if (newData[field]) updateData[field] = newData[field];
          }

          if (Object.keys(updateData).length > 0) {
            await Contact.findByIdAndUpdate(existingId, { $set: updateData });
          }

          results.merged++;

        } else if (action === "keep_both") {
          // Save as new separate contact
          const { _id, ...newContactData } = newData;
          await Contact.create({ ...newContactData, importLogId });
          results.kept_both++;
        }

      } catch (err) {
        results.errors.push({ existingId, action, error: err.message });
      }
    }

    await importLogRepository.update(importLogId, { status: "completed" });

    await notificationService.create({
      userId,
      type:    "import_complete",
      message: `Contact import complete — ${results.merged} merged, ${results.skipped} skipped, ${results.kept_both} kept as new`,
      refId:         importLogId,
      refCollection: "importLogs",
    });

    console.log(`✅ Contact duplicates resolved — Merged: ${results.merged} | Skipped: ${results.skipped} | Kept Both: ${results.kept_both}`);

    return results;
  },
};

export default contactImportService;