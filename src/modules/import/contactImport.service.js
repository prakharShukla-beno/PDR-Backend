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

    // ── Step 2: DB mein matching accounts dhundo ek hi query mein ─────────────
    const { prospects: existingAccounts } = await prospectRepository.findAll({
      filter: {
        accountName: {
          $in: uniqueAccountNames.map(n => new RegExp(`^${n}$`, "i")),
        },
      },
      page:  1,
      limit: 999999,
    });

    // accountName (lowercase) → accountId map banao
    const accountMap = {};
    for (const account of existingAccounts) {
      accountMap[account.accountName.toLowerCase()] = account._id;
    }

    // ── Step 3: Apollo style — rows prepare karo ──────────────────────────────
    // Contact skip nahi hoga agar account nahi mila
    // accountId = null rahega — baad mein link ho sakta hai
    const preparedRows = [];
    let linkedCount   = 0;
    let unlinkedCount = 0;

    for (const row of validRows) {
      const accountKey = row.accountName?.toLowerCase();
      const accountId  = accountMap[accountKey] || null; // null — skip nahi karo

      preparedRows.push({
        ...row,
        accountName: row.accountName || null, // reference ke liye store karo
        accountId,                            // null bhi ho sakta hai
        isLinked:    !!accountId,             // true agar account mila
        source:      filePath.toLowerCase().endsWith(".csv") ? "csv" : "excel",
        importLogId: importLog._id,
      });

      if (accountId) linkedCount++;
      else           unlinkedCount++;
    }

    console.log(`📦 Prepared: ${preparedRows.length} | Linked: ${linkedCount} | Unlinked: ${unlinkedCount}`);

    // ── Step 4: Chunked insertMany ─────────────────────────────────────────────
    let successCount = 0;
    const insertErrors = [];

    for (let i = 0; i < preparedRows.length; i += CHUNK_SIZE) {
      const chunk    = preparedRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

      try {
        const result   = await contactRepository.insertMany(chunk);
        const inserted = result.insertedCount ?? chunk.length;
        successCount  += inserted;
        console.log(`✅ Chunk ${chunkNum}: ${inserted} contacts inserted`);
      } catch (err) {
        console.error(`❌ Chunk ${chunkNum} error:`, err.message);
        if (err.result?.insertedCount) {
          successCount += err.result.insertedCount;
        }
        insertErrors.push(`Chunk ${chunkNum} fail: ${err.message}`);
      }

      // Progress update karo har chunk ke baad
      await importLogRepository.update(importLog._id, { successCount });
    }

    // ── Step 5: Final status update ───────────────────────────────────────────
    const allErrors   = [...errorDetails, ...insertErrors];
    const finalStatus =
      successCount === 0               ? "failed"    :
      successCount < validRows.length  ? "partial"   :
      "completed";

    await importLogRepository.update(importLog._id, {
      successCount,
      failedCount:  allErrors.length,
      errorDetails: allErrors,
      status:       finalStatus,
    });

    // File disk se delete karo
    fs.unlinkSync(filePath);

    // Notification bhejo
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