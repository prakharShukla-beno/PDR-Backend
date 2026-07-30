import fs from "fs";
import { processContactFile } from "../../common/utils/contactFileParser.js";
import Contact from "../contacts/contact.model.js";
import importLogRepository from "../importLog/importLog.repository.js";
import notificationService from "../notification/notification.service.js";
import auditLogService from "../auditLog/auditLog.service.js";
import Prospect from "../prospect/prospect.model.js";
import {
  isEmpty,
  hasValue,
} from "../../common/utils/contactDedup.js";

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
  // Save ALL valid rows (name + email required, checked in contactFileParser).
  // No duplicate check here — that happens separately via the
  // "Check Duplicates" button → POST /duplicates/check-contacts
  // (same pattern as account import).
  // ==========================================================================
  processContactImport: async (filePath, { userId, companyId }) => {

    const { validRows, errorDetails, totalRows } = processContactFile(filePath);

    console.log(`📊 Total: ${totalRows}, Valid: ${validRows.length}, Errors: ${errorDetails.length}`);

    const importLog = await importLogRepository.create({
      fileName:     filePath.split(/[\\\/]/).pop(),
      importType:   "excel",
      uploadedBy:   userId,
      companyId,
      totalRows,
      successCount: 0,
      failedCount:  errorDetails.length,
      errorDetails,
      status:       "processing",
    });

    if (!validRows || validRows.length === 0) {
      await importLogRepository.update(importLog._id, { status: "failed", failedCount: errorDetails.length });
      try { fs.unlinkSync(filePath); } catch (_) {}
      return { importLogId: importLog._id, totalRows, successCount: 0, failedCount: errorDetails.length, skippedCount: errorDetails.length, linkedCount: 0, unlinkedCount: 0, duplicates: [], errorDetails, status: "failed" };
    }

    // Get account map for linking
    const uniqueAccountNames = [...new Set(validRows.map(r => r.accountName?.trim()).filter(Boolean))];
    const accountMap = {};

    if (uniqueAccountNames.length > 0) {
      const accounts = await Prospect.find({
        companyId,
        accountNameLower: { $in: uniqueAccountNames.map(n => n.toLowerCase()) },
      }).select("_id accountName accountNameLower primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal website").lean();

      for (const acc of accounts) {
        if (acc.accountNameLower) accountMap[acc.accountNameLower] = acc;
      }
    }

    // Prepare all rows — accountName resolves to accountId when a matching
    // account exists; otherwise the contact is inserted unlinked.
    const preparedRows = validRows.map((row) => {
      const nameKey       = row.accountName?.trim().toLowerCase();
      const prospect      = nameKey ? accountMap[nameKey] : null;
      const accountFields = prospect ? extractAccountFields(prospect) : {};

      return {
        ...row,
        companyId,
        accountId:   prospect ? prospect._id : null,
        accountName: row.accountName?.trim() || null,
        isLinked:    !!prospect,
        ...accountFields,
        source:      filePath.toLowerCase().endsWith(".csv") ? "csv" : "excel",
        importLogId: importLog._id,
      };
    });

    // No dedup check at import time — every valid row goes straight to insert.
    const newRows       = preparedRows;
    const duplicateRows = [];
    const insertErrors  = [];

    // Account matching never rejects a row — unmatched/absent accountName just means
    // the contact is inserted with accountId: null, isLinked: false (unlinked).
    const unlinkedCount = newRows.filter((r) => !r.isLinked).length;
    const linkedCount   = newRows.length - unlinkedCount;

    console.log(`📦 New: ${newRows.length} (${linkedCount} linked, ${unlinkedCount} unlinked)`);

    let successCount = 0;

    for (let i = 0; i < newRows.length; i += CHUNK_SIZE) {
      const chunk    = newRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      const inserted = await safeInsertMany(chunk, chunkNum);
      successCount  += inserted;
      if (inserted < chunk.length) insertErrors.push(`Chunk ${chunkNum}: ${chunk.length - inserted} rows failed`);
      await importLogRepository.update(importLog._id, { successCount });
    }

    const allErrors     = [...errorDetails, ...insertErrors];
    const hasDuplicates = false;
    const finalStatus   =
      successCount === 0                    ? "failed"  :
      successCount < newRows.length         ? "partial" :
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
      description: `Contact import — ${successCount} saved. Use Check Duplicates to review.`,
    });

    console.log(
      `🏁 Contact import — ${successCount} imported (${unlinkedCount} unlinked), ` +
      `${errorDetails.length} skipped (missing email/name)`
    );

    return {
      importLogId:   importLog._id,
      totalRows,
      successCount,
      failedCount:   allErrors.length,
      skippedCount:  errorDetails.length, // rows skipped for missing required fields (email/name)
      linkedCount,
      unlinkedCount,
      duplicates:    duplicateRows,       // always [] now — populated later by /duplicates/check-contacts
      hasDuplicates,
      errorDetails:  allErrors,
      status:        finalStatus,
    };
  },

  // ==========================================================================
  // RESOLVE CONTACT DUPLICATES — Step 2
  // Actions: merge | skip | keep_both
  // ==========================================================================
  resolveContactDuplicates: async ({ importLogId, decisions, userId, companyId }) => {
    const results = { merged: 0, skipped: 0, kept_both: 0, errors: [] };

    for (const decision of decisions) {
      const { existingId, newData, action } = decision;

      try {
        if (action === "skip") {
          results.skipped++;

        } else if (action === "merge") {
          const existingContact = await Contact.findOne({ _id: existingId, companyId }).lean();
          if (!existingContact) {
            results.errors.push({ existingId, action, error: "Existing contact not found" });
            continue;
          }

          const updateData = {};
          const mergeFields = [
            "standardizedRoles", "functionalDomain", "keyFocusAreas",
            "primaryPhone", "secondaryPhone", "primaryMobNo",
            "linkedIn", "twitterUrl", "country", "state", "city", "timeZone",
            "accountId", "accountName", "accountIndustry", "accountCountry",
            "accountSalesPriority", "accountClvRanking", "isLinked",
          ];

          for (const field of mergeFields) {
            if (hasValue(newData[field]) && isEmpty(existingContact[field])) {
              updateData[field] = newData[field];
            }
          }

          if (Object.keys(updateData).length > 0) {
            await Contact.findOneAndUpdate({ _id: existingId, companyId }, { $set: updateData });
          }

          results.merged++;

        } else if (action === "keep_both") {
          const { _id, ...newContactData } = newData;
          await Contact.create({ ...newContactData, companyId, importLogId });
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