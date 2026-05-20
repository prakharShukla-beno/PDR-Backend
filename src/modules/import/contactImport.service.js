import fs from "fs";
import { processContactFile } from "../../common/utils/contactFileParser.js";
import contactRepository from "../contacts/contact.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";
import importLogRepository from "../importLog/importLog.repository.js";
import notificationService from "../notification/notification.service.js";

const CHUNK_SIZE = 1000;

const contactImportService = {

  processContactImport: async (filePath, userId) => {

    const { validRows, errorDetails, totalRows } = processContactFile(filePath);

    console.log(`📊 Total rows: ${totalRows}, Valid: ${validRows.length}, Errors: ${errorDetails.length}`);
    if (errorDetails.length > 0) {
      console.log("❌ First 5 errors:", errorDetails.slice(0, 5));
    }

    // Import log create karo
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

    // ── Step 1: Saare unique accountNames collect karo ────────────────────────
    const uniqueAccountNames = [...new Set(
      validRows.map(r => r.accountName?.toLowerCase()).filter(Boolean)
    )];

    // ── Step 2: DB mein dhundo matching accounts ───────────────────────────────
    const { prospects: existingAccounts } = await prospectRepository.findAll({
      filter: {
        accountName: {
          $in: uniqueAccountNames.map(n => new RegExp(`^${n}$`, "i")),
        },
      },
      page: 1,
      limit: 999999,
    });

    // accountName → accountId map banao
    const accountMap = {};
    for (const account of existingAccounts) {
      accountMap[account.accountName.toLowerCase()] = account._id;
    }

    // ── Step 3: Rows prepare karo ──────────────────────────────────────────────
    const preparedRows  = [];
    const skippedRows   = [];

    for (const row of validRows) {
      const accountKey = row.accountName?.toLowerCase();
      const accountId  = accountMap[accountKey];

      if (!accountId) {
        // Account nahi mila — skip karo, error log karo
        skippedRows.push(`Account "${row.accountName}" nahi mila — pehle account import karo`);
        continue;
      }

      const { accountName, ...contactData } = row; // accountName field hatao

      preparedRows.push({
        ...contactData,
        accountId,
        source:      filePath.toLowerCase().endsWith(".csv") ? "csv" : "excel",
        importLogId: importLog._id,
      });
    }

    console.log(`📦 Prepared: ${preparedRows.length}, Skipped (no account): ${skippedRows.length}`);

    // ── Step 4: Chunked insert ─────────────────────────────────────────────────
    let successCount = 0;
    const insertErrors = [];

    for (let i = 0; i < preparedRows.length; i += CHUNK_SIZE) {
      const chunk    = preparedRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

      try {
        const result  = await contactRepository.insertMany(chunk);
        const inserted = result.insertedCount ?? chunk.length;
        successCount += inserted;
        console.log(`✅ Chunk ${chunkNum}: ${inserted} contacts inserted`);
      } catch (err) {
        console.error(`❌ Chunk ${chunkNum} error:`, err.message);
        if (err.result?.insertedCount) {
          successCount += err.result.insertedCount;
        }
        insertErrors.push(`Chunk ${chunkNum} fail: ${err.message}`);
      }

      await importLogRepository.update(importLog._id, { successCount });
    }

    // ── Step 5: Final status ───────────────────────────────────────────────────
    const allErrors  = [...errorDetails, ...skippedRows, ...insertErrors];
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

    // File delete karo
    fs.unlinkSync(filePath);

    // Notification bhejo
    await notificationService.create({
      userId,
      type:          "import_complete",
      message:       `Contact import ${finalStatus} — ${successCount} of ${totalRows} contacts imported successfully`,
      refId:         importLog._id,
      refCollection: "importLogs",
    });

    console.log(`🏁 Contact import done — ${successCount} of ${totalRows}`);

    return {
      importLogId:  importLog._id,
      totalRows,
      successCount,
      failedCount:  allErrors.length,
      skippedCount: skippedRows.length,
      errorDetails: allErrors,
      status:       finalStatus,
    };
  },
};

export default contactImportService;