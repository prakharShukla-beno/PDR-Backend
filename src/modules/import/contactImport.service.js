import fs from "fs";
import { processContactFile } from "../../common/utils/contactFileParser.js";
import contactRepository from "../contacts/contact.repository.js";
import importLogRepository from "../importLog/importLog.repository.js";
import notificationService from "../notification/notification.service.js";
import Prospect from "../prospect/prospect.model.js";

const CHUNK_SIZE = 1000;

// ─── Helper: Prospect se denormalized fields nikalo ───────────────────────────
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

// ─── Helper: Safe insertMany — 1 row se 1 lakh tak handle karo ───────────────
const safeInsertMany = async (repository, docs, chunkNum) => {
  if (!docs || docs.length === 0) return 0;
  try {
    await repository.insertMany(docs, { ordered: false });
    console.log(`✅ Chunk ${chunkNum}: ${docs.length} rows inserted`);
    return docs.length;
  } catch (err) {
    if (err.name === "BulkWriteError" || err.code === 11000) {
      const inserted = err.result?.nInserted ?? err.result?.insertedCount ?? 0;
      console.warn(`⚠️  Chunk ${chunkNum}: ${inserted}/${docs.length} inserted (partial)`);
      return inserted;
    }
    console.error(`❌ Chunk ${chunkNum} error:`, err.message);
    return 0;
  }
};

const contactImportService = {

  processContactImport: async (filePath, userId) => {

    const { validRows, errorDetails, totalRows } = processContactFile(filePath);

    console.log(`📊 Total rows: ${totalRows}, Valid: ${validRows.length}, Errors: ${errorDetails.length}`);
    if (errorDetails.length > 0) {
      console.log("❌ First 5 errors:", errorDetails.slice(0, 5));
    }

    // ── Import log create ──────────────────────────────────────────────────
    const importLog = await importLogRepository.create({
      fileName:     filePath.split(/[\\/]/).pop(),
      importType:   "excel",
      uploadedBy:   userId,
      totalRows,
      successCount: 0,
      failedCount:  errorDetails.length,
      errorDetails,
      status:       "processing",
    });

    // ── Early exit — koi valid row nahi ───────────────────────────────────
    if (!validRows || validRows.length === 0) {
      await importLogRepository.update(importLog._id, {
        status:      "failed",
        failedCount: errorDetails.length,
      });
      try { fs.unlinkSync(filePath); } catch (_) {}
      return {
        importLogId:   importLog._id,
        totalRows,
        successCount:  0,
        failedCount:   errorDetails.length,
        linkedCount:   0,
        unlinkedCount: 0,
        errorDetails,
        status:        "failed",
      };
    }

    // ── Step 1: Unique accountNames — ek baar mein saare fetch karo ────────
    const uniqueAccountNames = [
      ...new Set(validRows.map(r => r.accountName?.trim()).filter(Boolean)),
    ];

    const accountMap = {};

    if (uniqueAccountNames.length > 0) {
      // Regex nahi — exact match via accountNameLower index
      // 1 lakh contacts pe bhi fast rahega
      const existingAccounts = await Prospect.find({
        accountNameLower: { $in: uniqueAccountNames.map(n => n.toLowerCase()) },
      }).select(
        "_id accountName accountNameLower primaryIndustry country hqLocationCity " +
        "noOfEmployees annualRevenue businessModel salesPriority clvRanking " +
        "techFitScore intentSignal website"
      ).lean();

      for (const acc of existingAccounts) {
        if (acc.accountNameLower) accountMap[acc.accountNameLower] = acc;
      }

      console.log(`✅ Accounts matched: ${existingAccounts.length} of ${uniqueAccountNames.length}`);
    }

    // ── Step 2: Rows prepare karo ──────────────────────────────────────────
    const preparedRows = [];
    let linkedCount    = 0;
    let unlinkedCount  = 0;

    for (const row of validRows) {
      const nameKey   = row.accountName?.trim().toLowerCase();
      const prospect  = nameKey ? accountMap[nameKey] : null;
      const accountFields = prospect ? extractAccountFields(prospect) : {};

      preparedRows.push({
        ...row,
        accountId:   prospect ? prospect._id : null,
        accountName: row.accountName?.trim() || null,
        isLinked:    !!prospect,
        ...accountFields,
        source:      filePath.toLowerCase().endsWith(".csv") ? "csv" : "excel",
        importLogId: importLog._id,
      });

      if (prospect) linkedCount++;
      else          unlinkedCount++;
    }

    console.log(`📦 Prepared: ${preparedRows.length} | Linked: ${linkedCount} | Unlinked: ${unlinkedCount}`);

    // ── Step 3: Chunked insertMany ─────────────────────────────────────────
    let successCount = 0;
    const insertErrors = [];

    for (let i = 0; i < preparedRows.length; i += CHUNK_SIZE) {
      const chunk    = preparedRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

      const inserted = await safeInsertMany(contactRepository, chunk, chunkNum);
      successCount  += inserted;

      if (inserted < chunk.length) {
        insertErrors.push(`Chunk ${chunkNum}: ${chunk.length - inserted} rows failed`);
      }

      await importLogRepository.update(importLog._id, { successCount });
    }

    // ── Step 4: Final status ───────────────────────────────────────────────
    const allErrors   = [...errorDetails, ...insertErrors];
    const finalStatus =
      successCount === 0              ? "failed"    :
      successCount < validRows.length ? "partial"   :
      "completed";

    await importLogRepository.update(importLog._id, {
      successCount,
      failedCount:  allErrors.length,
      errorDetails: allErrors,
      status:       finalStatus,
    });

    try { fs.unlinkSync(filePath); } catch (_) {}

    await notificationService.create({
      userId,
      type:          "import_complete",
      message:       `Contact import ${finalStatus} — ${successCount} of ${totalRows} imported. Linked: ${linkedCount}, Unlinked: ${unlinkedCount}`,
      refId:         importLog._id,
      refCollection: "importLogs",
    });

    console.log(`🏁 Contact import done — ${successCount}/${totalRows} | Linked: ${linkedCount} | Unlinked: ${unlinkedCount}`);

    return {
      importLogId:   importLog._id,
      totalRows,
      successCount,
      failedCount:   allErrors.length,
      linkedCount,
      unlinkedCount,
      errorDetails:  allErrors,
      status:        finalStatus,
    };
  },
};

export default contactImportService;