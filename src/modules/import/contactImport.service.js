import fs from "fs";
import { processContactFile } from "../../common/utils/contactFileParser.js";
import { normalizeAccountName } from "../../common/utils/contactImportHelpers.js";
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

// Build accountName → Prospect map (exact match + normalized fallback)
const buildAccountMap = async (uniqueAccountNames, companyId) => {
  const accountMap = {};

  if (uniqueAccountNames.length > 0) {
    const accounts = await Prospect.find({
      companyId,
      accountNameLower: { $in: uniqueAccountNames.map((n) => n.toLowerCase()) },
    })
      .select(
        "_id accountName accountNameLower primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal website"
      )
      .lean();

    for (const acc of accounts) {
      if (acc.accountNameLower) accountMap[acc.accountNameLower] = acc;
    }
  }

  // Fallback: normalized matching for names that didn't match exactly
  for (const accountName of uniqueAccountNames) {
    const nameKey = accountName?.trim().toLowerCase();
    if (!nameKey || accountMap[nameKey]) continue;

    const normalized = normalizeAccountName(accountName);
    if (!normalized) continue;

    const prospect = await Prospect.findOne({
      companyId,
      accountNameLower: {
        $regex: new RegExp(
          `^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i"
        ),
      },
    })
      .select(
        "_id accountName accountNameLower primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal website"
      )
      .lean();

    if (prospect && prospect.accountNameLower) {
      accountMap[nameKey] = prospect;
    }
  }

  return accountMap;
};

// ==========================================================================
// Core import runner — shared by both the sync and async entry points.
// Parses the file, links accounts, inserts contacts in chunks, and keeps
// the ImportLog document updated as progress happens (so status polling
// works for the async flow).
// ==========================================================================
const runContactImportJob = async (filePath, importLog, { userId, companyId }) => {
  const { validRows, errorDetails, totalRows } = processContactFile(filePath);

  console.log(`📊 Total: ${totalRows}, Valid: ${validRows.length}, Errors: ${errorDetails.length}`);

  await importLogRepository.update(importLog._id, {
    totalRows,
    failedCount: errorDetails.length,
    errorDetails,
  });

  if (!validRows || validRows.length === 0) {
    await importLogRepository.update(importLog._id, { status: "failed", failedCount: errorDetails.length });
    try { fs.unlinkSync(filePath); } catch (_) {}
    return {
      importLogId: importLog._id, totalRows, successCount: 0,
      failedCount: errorDetails.length, skippedCount: errorDetails.length,
      linkedCount: 0, unlinkedCount: 0, duplicates: [], errorDetails, status: "failed",
    };
  }

  // Build accountName → account map for linking
  const uniqueAccountNames = [...new Set(validRows.map((r) => r.accountName?.trim()).filter(Boolean))];
  const accountMap = await buildAccountMap(uniqueAccountNames, companyId);

  // Prepare all rows — accountName resolves to accountId when a matching
  // account exists; otherwise the contact is inserted unlinked.
  const preparedRows = validRows.map((row) => {
    const nameKey = row.accountName?.trim().toLowerCase();
    const prospect = nameKey ? accountMap[nameKey] : null;
    const accountFields = prospect ? extractAccountFields(prospect) : {};

    return {
      ...row,
      companyId,
      accountId: prospect ? prospect._id : null,
      accountName: row.accountName?.trim() || null,
      isLinked: !!prospect,
      ...accountFields,
      source: filePath.toLowerCase().endsWith(".csv") ? "csv" : "excel",
      importLogId: importLog._id,
    };
  });

  const newRows       = preparedRows;
  const duplicateRows = [];
  const insertErrors  = [];

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

    // Progressive update so status polling shows live progress
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
    skippedCount:  errorDetails.length,
    linkedCount,
    unlinkedCount,
    duplicates:    duplicateRows,
    hasDuplicates,
    errorDetails:  allErrors,
    status:        finalStatus,
  };
};

const contactImportService = {

  // ==========================================================================
  // CONTACT IMPORT (SYNC) — kept for backward compatibility.
  // Blocks until the entire file is processed. Fine for small files, but
  // large files (10k+ rows) risk hitting request/proxy timeouts on hosts
  // like Render. Prefer processContactImportAsync for the upload UI.
  // ==========================================================================
  processContactImport: async (filePath, { userId, companyId }) => {
    const importLog = await importLogRepository.create({
      fileName:     filePath.split(/[\\\/]/).pop(),
      importType:   "excel",
      uploadedBy:   userId,
      companyId,
      totalRows:    0,
      successCount: 0,
      failedCount:  0,
      errorDetails: [],
      status:       "processing",
    });

    return runContactImportJob(filePath, importLog, { userId, companyId });
  },

  // ==========================================================================
  // CONTACT IMPORT (ASYNC) — mirrors the account import's async job pattern.
  // Creates the ImportLog immediately and returns its id right away; the
  // actual parsing/linking/insert work happens in the background so the
  // HTTP request returns instantly and never hits a timeout.
  // ==========================================================================
  processContactImportAsync: async (filePath, { userId, companyId }) => {
    const importLog = await importLogRepository.create({
      fileName:     filePath.split(/[\\\/]/).pop(),
      importType:   "excel",
      uploadedBy:   userId,
      companyId,
      totalRows:    0,
      successCount: 0,
      failedCount:  0,
      errorDetails: [],
      status:       "processing",
    });

    // Fire-and-forget — same 100ms-deferred pattern used by the account
    // import worker, so the response can flush before heavy work starts.
    setTimeout(() => {
      runContactImportJob(filePath, importLog, { userId, companyId }).catch(async (err) => {
        console.error(`Contact import ${importLog._id} failed:`, err.message);
        await importLogRepository.update(importLog._id, {
          status: "failed",
          errorDetails: [err.message],
        }).catch(() => {});
        try { fs.unlinkSync(filePath); } catch (_) {}
      });
    }, 100);

    return { importLogId: importLog._id, status: "processing" };
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