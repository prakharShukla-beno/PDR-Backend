import fs from "fs";
import { processExcelFile, sanitizeProspectRow } from "../../common/utils/excelParser.js";
import prospectRepository from "../prospect/prospect.repository.js";
import duplicateRepository from "../duplicate/duplicate.repository.js";
import importLogRepository from "../importLog/importLog.repository.js";
import notificationService from "../notification/notification.service.js";
import auditLogService from "../auditLog/auditLog.service.js";
import contactRepository from "../contacts/contact.repository.js";
import Contact from "../contacts/contact.model.js";
import Prospect from "../prospect/prospect.model.js";
import {
  isEmpty,
  hasValue,
  buildContactDedupIndexes,
  findDbContactDuplicate,
  createInFileDedupTracker,
  checkInFileDuplicate,
  registerInFileRow,
  fetchExistingContactsForDedup,
  normEmail,
  normPhone,
  nameAccountKey,
} from "../../common/utils/contactDedup.js";

const CHUNK_SIZE = 1000;

// Extract denormalized account fields for contacts
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

// Safe bulk insert — partial failures allowed
const safeInsertMany = async (repository, docs, chunkNum) => {
  if (!docs || docs.length === 0) return 0;
  try {
    await repository.insertMany(docs, { ordered: false });
    console.log(`✅ Chunk ${chunkNum}: ${docs.length} rows inserted`);
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

const importService = {

  // ===========================================================================
  // ACCOUNT EXCEL IMPORT — Step 1
  // Save non-duplicates and return duplicates to the user for review
  // ===========================================================================
  processExcelImport: async (filePath, userId) => {

    const { validRows, errorDetails, totalRows } = processExcelFile(filePath);

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
      return { importLogId: importLog._id, totalRows, successCount: 0, failedCount: errorDetails.length, duplicates: [], contactsSaved: 0, errorDetails, status: "failed" };
    }

    // Check which rows already exist in DB
    const accountNames = validRows.map(r => r.accountName).filter(Boolean);
    const websites     = validRows.map(r => r.website).filter(Boolean);

    let existingProspects = { prospects: [] };
    if (accountNames.length > 0 || websites.length > 0) {
      existingProspects = await prospectRepository.findAll({
        filter: {
          $or: [
            { accountNameLower: { $in: accountNames.map(n => n.toLowerCase()) } },
            { website:          { $in: websites.map(w => w.toLowerCase()) } },
          ],
        },
        page: 1, limit: 999999,
      });
    }

    const existingMap     = {};
    const existingNames   = new Set();
    const existingWebsites= new Set();

    for (const p of (existingProspects.prospects || [])) {
      if (p.accountName) {
        existingNames.set   ? existingNames.add(p.accountName.toLowerCase()) : null;
        existingNames.add(p.accountName.toLowerCase());
        existingMap[p.accountName.toLowerCase()] = p;
      }
      if (p.website) {
        existingWebsites.add(p.website.toLowerCase());
        existingMap[p.website.toLowerCase()] = p;
      }
    }

    // Separate new rows from duplicate rows
    const newRows       = [];
    const duplicateRows = [];

    for (const row of validRows) {
      const nameMatch    = row.accountName && existingNames.has(row.accountName.toLowerCase());
      const websiteMatch = row.website     && existingWebsites.has(row.website.toLowerCase());
      const isDuplicate  = nameMatch || websiteMatch;

      const { contacts, ...prospectData } = row;

      if (isDuplicate) {
        // Find the existing record
        const existingKey = nameMatch
          ? row.accountName.toLowerCase()
          : row.website.toLowerCase();
        const existingRecord = existingMap[existingKey];

        // Save duplicate to DB for review on Duplicates page
        const matchFields = [nameMatch && "accountName", websiteMatch && "website"].filter(Boolean);
        await duplicateRepository.create({
          prospectId1: existingRecord._id,
          newData:     { ...prospectData, contacts },
          matchFields,
          source:      "import",
          importLogId: importLog._id,
          status:      "pending",
        });
        duplicateRows.push({
          newData:      { ...prospectData, contacts },
          existingData: existingRecord,
          matchFields,
        });
      } else {
        newRows.push(sanitizeProspectRow({
          ...prospectData,
          isDuplicate: false,
          source:      "excel",
          importLogId: importLog._id,
        }));
      }
    }

    console.log(`📦 New: ${newRows.length} | Duplicates pending review: ${duplicateRows.length}`);

    // Insert non-duplicate rows immediately
    let successCount = 0;
    const insertErrors = [];
    const insertedProspectMap = {};

    for (let i = 0; i < newRows.length; i += CHUNK_SIZE) {
      const chunk    = newRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      const inserted = await safeInsertMany(prospectRepository, chunk, chunkNum);
      successCount  += inserted;
      if (inserted < chunk.length) insertErrors.push(`Chunk ${chunkNum}: ${chunk.length - inserted} rows failed`);
      await importLogRepository.update(importLog._id, { successCount });
    }

    // Fetch inserted prospects for contact linking
    if (accountNames.length > 0) {
      const insertedProspects = await Prospect.find({
        accountNameLower: { $in: accountNames.map(n => n.toLowerCase()) },
      }).select("_id accountName accountNameLower primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal website").lean();

      for (const p of insertedProspects) {
        if (p.accountNameLower) insertedProspectMap[p.accountNameLower] = p;
      }
    }

    // Save contacts from new (non-duplicate) rows
    const contactsToInsert = [];
    for (const row of validRows) {
      const contacts = row.contacts;
      if (!contacts || contacts.length === 0) continue;

      const key             = row.accountName?.toLowerCase().trim();
      const matchedProspect = key ? insertedProspectMap[key] : null;
      if (!matchedProspect) continue;

      const accountFields = extractAccountFields(matchedProspect);
      for (const contact of contacts) {
        if (!contact.name && !contact.email && !contact.phone) continue;
        const nameParts = (contact.name || "").trim().split(" ");
        contactsToInsert.push({
          accountId:         matchedProspect._id,
          accountName:       row.accountName,
          isLinked:          true,
          ...accountFields,
          firstName:         nameParts[0]                 || null,
          lastName:          nameParts.slice(1).join(" ") || null,
          standardizedRoles: contact.designation          || null,
          functionalDomain:  contact.department           || null,
          email:             contact.email                || null,
          primaryPhone:      contact.phone                || null,
          secondaryPhone:    contact.phone2               || null,
          linkedIn:          contact.linkedIn             || null,
          isPrimary:         contact.isPrimary            ?? true,
          source:            "account_import",
          importLogId:       importLog._id,
        });
      }
    }

    // Dedup auto-created contacts against DB + within the same file (B6)
    const existingForDedup = await fetchExistingContactsForDedup(Contact, contactsToInsert);
    const dedupIndexes     = buildContactDedupIndexes(existingForDedup);
    const fileTracker      = createInFileDedupTracker();
    const contactsNew      = [];
    const deferredInFileDups = [];
    let contactDupCount    = 0;

    for (const contact of contactsToInsert) {
      const dbDup = findDbContactDuplicate(contact, dedupIndexes);
      if (dbDup) {
        await duplicateRepository.create({
          prospectId1: dbDup.existing._id,
          entityType:  "Contact",
          newData:     contact,
          matchFields: dbDup.matchFields,
          source:      "import",
          importLogId: importLog._id,
          status:      "pending",
        });
        contactDupCount++;
        continue;
      }

      const inFileDup = checkInFileDuplicate(contact, fileTracker);
      if (inFileDup) {
        deferredInFileDups.push({
          contact,
          matchFields:  inFileDup.matchFields,
          firstRowData: inFileDup.firstRow,
        });
        insertErrors.push(
          `In-file contact duplicate (${inFileDup.matchFields.join(", ")}): ` +
          `${contact.email || contact.primaryPhone || `${contact.firstName} ${contact.lastName}`.trim()}`
        );
        continue;
      }

      registerInFileRow(contact, fileTracker);
      contactsNew.push(contact);
    }

    let contactsSaved = 0;
    for (let i = 0; i < contactsNew.length; i += CHUNK_SIZE) {
      contactsSaved += await safeInsertMany(contactRepository, contactsNew.slice(i, i + CHUNK_SIZE), `C${Math.floor(i / CHUNK_SIZE) + 1}`);
    }

    // Flag in-file duplicates for review once the first row is in DB
    if (deferredInFileDups.length > 0 && contactsSaved > 0) {
      const insertedContacts = await Contact.find({ importLogId: importLog._id })
        .select("_id email primaryPhone firstName lastName accountName")
        .lean();

      const insertedByEmail = {};
      const insertedByPhone = {};
      const insertedByNameAccount = {};
      for (const c of insertedContacts) {
        const email = normEmail(c.email);
        if (email) insertedByEmail[email] = c;
        const phone = normPhone(c.primaryPhone);
        if (phone) insertedByPhone[phone] = c;
        const nameKey = nameAccountKey(c);
        if (nameKey) insertedByNameAccount[nameKey] = c;
      }

      for (const dup of deferredInFileDups) {
        const first = dup.firstRowData;
        const existing =
          (normEmail(first.email) && insertedByEmail[normEmail(first.email)]) ||
          (normPhone(first.primaryPhone) && insertedByPhone[normPhone(first.primaryPhone)]) ||
          (nameAccountKey(first) && insertedByNameAccount[nameAccountKey(first)]);

        if (existing) {
          await duplicateRepository.create({
            prospectId1: existing._id,
            entityType:  "Contact",
            newData:     dup.contact,
            matchFields: dup.matchFields,
            source:      "import",
            importLogId: importLog._id,
            status:      "pending",
          });
          contactDupCount++;
        }
      }
    }

    // Auto-link unlinked contacts
    if (Object.keys(insertedProspectMap).length > 0) {
      try {
        for (const [key, prospect] of Object.entries(insertedProspectMap)) {
          const fields = extractAccountFields(prospect);
          await contactRepository.updateMany(
            { accountName: { $regex: `^${prospect.accountName}$`, $options: "i" }, isLinked: false },
            { $set: { accountId: prospect._id, isLinked: true, ...fields } }
          );
        }
      } catch (err) {
        console.error("Auto-link error:", err.message);
      }
    }

    // Update import log
    const allErrors   = [...errorDetails, ...insertErrors];
    const hasDuplicates = duplicateRows.length > 0 || contactDupCount > 0;
    const finalStatus =
      successCount === 0 && !hasDuplicates ? "failed"     :
      hasDuplicates                        ? "partial"    :
      successCount < newRows.length        ? "partial"    :
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
      description: `Account import — ${successCount} saved, ${duplicateRows.length + contactDupCount} duplicates need review`,
      metadata:    { successCount, duplicateCount: duplicateRows.length + contactDupCount, contactsSaved },
    });

    console.log(`🏁 Import done — ${successCount} saved | ${duplicateRows.length} duplicates pending | Contacts: ${contactsSaved}`);

    // Return duplicates to frontend for user review
    return {
      importLogId:    importLog._id,
      totalRows,
      successCount,
      failedCount:    allErrors.length,
      contactsSaved,
      duplicates:     duplicateRows,    // ← This is returned for the frontend to display
      hasDuplicates:  hasDuplicates,
      errorDetails:   allErrors,
      status:         finalStatus,
    };
  },

  // ===========================================================================
  // RESOLVE DUPLICATES — Step 2
  // Process after the user decision
  // Actions: "merge" | "skip" | "keep_both"
  // ===========================================================================
  resolveDuplicates: async ({ importLogId, decisions, userId }) => {
    const results = { merged: 0, skipped: 0, kept_both: 0, errors: [] };

    for (const decision of decisions) {
      const { existingId, newData, action } = decision;

      try {
        if (action === "skip") {
          // Do nothing — existing record stays as is
          results.skipped++;

        } else if (action === "merge") {
          const existingProspect = await prospectRepository.findById(existingId);
          if (!existingProspect) {
            results.errors.push({ existingId, action, error: "Existing prospect not found" });
            continue;
          }

          const updateData = {};
          const mergeFields = [
            "primaryIndustry", "businessModel", "country", "hqLocationCity",
            "annualRevenue", "noOfEmployees", "primaryTechStack", "secondaryTechStack",
            "techAdoptionProfile", "infrastructureRisk", "techFitScore",
            "intentSignal", "salesPriority", "clvRanking", "financialCapacity",
            "marginPotential", "strategicValue", "historyTrigger", "servicePitch",
            "commercialCategory", "accountSource", "campaignName", "comments",
          ];

          for (const field of mergeFields) {
            if (hasValue(newData[field]) && isEmpty(existingProspect[field])) {
              updateData[field] = newData[field];
            }
          }

          if (Object.keys(updateData).length > 0) {
            await prospectRepository.update(existingId, updateData);
          }

          await auditLogService.log({
            userId,
            action:      "UPDATE",
            entity:      "Prospect",
            entityId:    existingId,
            description: `Duplicate merged — existing record updated with new data`,
          });

          results.merged++;

        } else if (action === "keep_both") {
          // Save new record as separate entry
          const importLog = await importLogRepository.findById(importLogId);
          await prospectRepository.create({
            ...newData,
            isDuplicate: true,
            source:      "excel",
            importLogId: importLogId,
          });

          results.kept_both++;
        }
      } catch (err) {
        results.errors.push({ existingId, action, error: err.message });
        console.error(`Resolve error for ${existingId}:`, err.message);
      }
    }

    // Update import log as completed
    await importLogRepository.update(importLogId, { status: "completed" });

    await notificationService.create({
      userId,
      type:    "import_complete",
      message: `Import complete — ${results.merged} merged, ${results.skipped} skipped, ${results.kept_both} kept as new`,
      refId:         importLogId,
      refCollection: "importLogs",
    });

    console.log(`✅ Duplicates resolved — Merged: ${results.merged} | Skipped: ${results.skipped} | Kept Both: ${results.kept_both}`);

    return results;
  },

  // ===========================================================================
  // CONTACT EXCEL IMPORT
  // ===========================================================================
  processContactImport: async (filePath, userId) => {

    const { processContactFile } = await import("../../common/utils/contactFileParser.js");
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
      return { importLogId: importLog._id, totalRows, successCount: 0, failedCount: errorDetails.length, linkedCount: 0, unlinkedCount: 0, errorDetails, status: "failed" };
    }

    const uniqueAccountNames = [...new Set(validRows.map(r => r.accountName?.trim()).filter(Boolean))];
    const accountMap = {};

    if (uniqueAccountNames.length > 0) {
      const existingAccounts = await Prospect.find({
        accountNameLower: { $in: uniqueAccountNames.map(n => n.toLowerCase()) },
      }).select("_id accountName accountNameLower primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal website").lean();

      for (const acc of existingAccounts) {
        if (acc.accountNameLower) accountMap[acc.accountNameLower] = acc;
      }
    }

    const preparedRows = [];
    let linkedCount    = 0;
    let unlinkedCount  = 0;

    for (const row of validRows) {
      const nameKey       = row.accountName?.trim().toLowerCase();
      const prospect      = nameKey ? accountMap[nameKey] : null;
      const accountFields = prospect ? extractAccountFields(prospect) : {};

      preparedRows.push({
        ...row,
        accountId:   prospect ? prospect._id : null,
        accountName: row.accountName?.trim() || null,
        isLinked:    !!prospect,
        ...accountFields,
        source:      "excel",
        importLogId: importLog._id,
      });

      if (prospect) linkedCount++;
      else          unlinkedCount++;
    }

    let successCount = 0;
    const insertErrors = [];

    for (let i = 0; i < preparedRows.length; i += CHUNK_SIZE) {
      const chunk    = preparedRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      const inserted = await safeInsertMany(contactRepository, chunk, chunkNum);
      successCount  += inserted;
      if (inserted < chunk.length) insertErrors.push(`Chunk ${chunkNum}: ${chunk.length - inserted} rows failed`);
      await importLogRepository.update(importLog._id, { successCount });
    }

    const allErrors   = [...errorDetails, ...insertErrors];
    const finalStatus =
      successCount === 0              ? "failed"    :
      successCount < validRows.length ? "partial"   :
      "completed";

    await importLogRepository.update(importLog._id, { successCount, failedCount: allErrors.length, errorDetails: allErrors, status: finalStatus });
    try { fs.unlinkSync(filePath); } catch (_) {}

    await notificationService.create({
      userId,
      type:    "import_complete",
      message: `Contact import ${finalStatus} — ${successCount} of ${totalRows} imported. Linked: ${linkedCount}, Unlinked: ${unlinkedCount}`,
      refId:         importLog._id,
      refCollection: "importLogs",
    });

    console.log(`🏁 Contact import done — ${successCount}/${totalRows} | Linked: ${linkedCount} | Unlinked: ${unlinkedCount}`);

    return { importLogId: importLog._id, totalRows, successCount, failedCount: allErrors.length, linkedCount, unlinkedCount, errorDetails: allErrors, status: finalStatus };
  },

  getImportStatus: async (importLogId) => {
    return await importLogRepository.findById(importLogId);
  },
};

export default importService;