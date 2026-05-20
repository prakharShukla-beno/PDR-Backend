import fs from "fs";
import { processExcelFile } from "../../common/utils/excelParser.js";
import prospectRepository from "../prospect/prospect.repository.js";
import duplicateRepository from "../duplicate/duplicate.repository.js";
import importLogRepository from "../importLog/importLog.repository.js";
import notificationService from "../notification/notification.service.js";
import contactRepository from "../contacts/contact.repository.js";
import Prospect from "../prospect/prospect.model.js";

const CHUNK_SIZE = 1000;

const importService = {

  // =========================================
  // Prospect Excel Import
  // =========================================
  processExcelImport: async (filePath, userId) => {

    const { validRows, errorDetails, totalRows } = processExcelFile(filePath);

    console.log(`📊 Total rows: ${totalRows}, Valid: ${validRows.length}, Errors: ${errorDetails.length}`);

    if (errorDetails.length > 0) {
      console.log("❌ First 5 validation errors:", errorDetails.slice(0, 5));
    }

    const importLog = await importLogRepository.create({
      fileName:     filePath.split(/[\\/]/).pop(),
      importType:   "excel",
      uploadedBy:   userId,
      totalRows,
      successCount: 0,
      failedCount:  errorDetails.length,
      errorDetails,
      status:       "partial",
    });

    let successCount = 0;
    const insertErrors = [];

    const accountNames = validRows.map(r => r.accountName).filter(Boolean);
    const websites     = validRows.map(r => r.website).filter(Boolean);

    const existingProspects = await prospectRepository.findAll({
      filter: {
        $or: [
          { accountName: { $in: accountNames } },
          { website:     { $in: websites } },
        ],
      },
      page:  1,
      limit: 999999,
    });

    const existingNames = new Set(
      existingProspects.prospects.map(p => p.accountName?.toLowerCase())
    );

    const existingWebsites = new Set(
      existingProspects.prospects.map(p => p.website?.toLowerCase())
    );

    const preparedRows  = [];
    const duplicateRows = [];

    for (const row of validRows) {

      const isDuplicate =
        (row.accountName && existingNames.has(row.accountName.toLowerCase())) ||
        (row.website     && existingWebsites.has(row.website.toLowerCase()));

      preparedRows.push({
        ...row,
        isDuplicate,
        source:      "excel",
        importLogId: importLog._id,
      });

      if (isDuplicate) {
        duplicateRows.push(row);
      }
    }

    console.log(`📦 Prepared rows: ${preparedRows.length}, Duplicates: ${duplicateRows.length}`);

    // =========================================
    // Chunked insert
    // =========================================
    for (let i = 0; i < preparedRows.length; i += CHUNK_SIZE) {

      const chunk    = preparedRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

      try {

        const result = await prospectRepository.insertMany(chunk);

        const inserted = result.insertedCount ?? chunk.length;

        successCount += inserted;

        console.log(`✅ Chunk ${chunkNum}: ${inserted} rows inserted`);

      } catch (err) {

        console.error(`❌ Chunk ${chunkNum} error:`, err.message);

        if (err.writeErrors?.length > 0) {
          console.error(
            "First write error:",
            JSON.stringify(err.writeErrors[0].err, null, 2)
          );
        }

        if (err.result?.insertedCount) {
          successCount += err.result.insertedCount;
          console.log(`⚠️ Chunk ${chunkNum}: partial — ${err.result.insertedCount} inserted`);
        }

        insertErrors.push(`Chunk ${chunkNum} fail: ${err.message}`);
      }

      await importLogRepository.update(importLog._id, { successCount });
    }

    // =========================================
    // Duplicate records log
    // =========================================
    for (const row of duplicateRows) {

      try {

        const existing = existingProspects.prospects.find(
          p =>
            p.accountName?.toLowerCase() === row.accountName?.toLowerCase() ||
            p.website?.toLowerCase() === row.website?.toLowerCase()
        );

        const inserted = await prospectRepository.findAll({
          filter: {
            accountName: row.accountName,
            source: "excel",
          },
          page: 1,
          limit: 1,
        });

        if (existing && inserted.prospects[0]) {

          const matchFields = [];

          if (row.accountName) matchFields.push("accountName");
          if (row.website)     matchFields.push("website");

          await duplicateRepository.create({
            prospectId1: existing._id,
            prospectId2: inserted.prospects[0]._id,
            matchFields,
            status: "pending",
          });
        }

      } catch (err) {

        insertErrors.push(`Duplicate log failed for: ${row.accountName}`);
      }
    }

    const finalStatus =
      successCount === 0
        ? "failed"
        : successCount < validRows.length
        ? "partial"
        : "completed";

    await importLogRepository.update(importLog._id, {
      successCount,
      failedCount:  errorDetails.length + insertErrors.length,
      errorDetails: [...errorDetails, ...insertErrors],
      status:       finalStatus,
    });

    fs.unlinkSync(filePath);

    await notificationService.create({
      userId,
      type:          "import_complete",
      message:       `Import ${finalStatus} — ${successCount} of ${totalRows} rows imported successfully`,
      refId:         importLog._id,
      refCollection: "importLogs",
    });

    console.log(`🏁 Import done — ${successCount} of ${totalRows} rows`);

    return {
      importLogId: importLog._id,
      totalRows,
      successCount,
      failedCount: errorDetails.length + insertErrors.length,
      errorDetails: [...errorDetails, ...insertErrors],
      status: finalStatus,
    };
  },

  // =========================================
  // Contact Excel Import
  // =========================================
  processContactImport: async (filePath, userId) => {

    const { processContactExcel } = await import(
      "../../common/utils/contactParser.js"
    );

    const { validRows, errorDetails, totalRows } =
      processContactExcel(filePath);

    console.log(
      `📊 Contact import — Total: ${totalRows}, Valid: ${validRows.length}, Errors: ${errorDetails.length}`
    );

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

    let successCount = 0;
    const insertErrors = [];

    // =========================================
    // Auto-link contacts to accounts
    // =========================================
    const accountNames = [
      ...new Set(
        validRows
          .map(r => r.accountName)
          .filter(Boolean)
      ),
    ];

    const existingAccounts = await Prospect.find({
      accountName: {
        $in: accountNames.map(
          n => new RegExp(`^${n}$`, "i")
        ),
      },
    }).select("_id accountName");

    // accountName -> _id map
    const accountMap = {};

    existingAccounts.forEach(account => {
      accountMap[account.accountName.toLowerCase()] = account._id;
    });

    // =========================================
    // Prepare rows
    // =========================================
    const preparedRows = validRows.map(row => {

      const accountId = row.accountName
        ? accountMap[row.accountName.toLowerCase()] || null
        : null;

      return {
        ...row,
        accountId,
        isLinked: !!accountId,
        source: "excel",
        importLogId: importLog._id,
      };
    });

    const linked = preparedRows.filter(r => r.isLinked).length;

    const unlinked = preparedRows.filter(r => !r.isLinked).length;

    console.log(`🔗 Linked: ${linked} | Unlinked: ${unlinked}`);

    // =========================================
    // Chunked insert
    // =========================================
    for (let i = 0; i < preparedRows.length; i += CHUNK_SIZE) {

      const chunk = preparedRows.slice(i, i + CHUNK_SIZE);

      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

      try {

        const result = await contactRepository.insertMany(chunk);

        const inserted = result.insertedCount ?? chunk.length;

        successCount += inserted;

        console.log(
          `✅ Contact chunk ${chunkNum}: ${inserted} rows inserted`
        );

      } catch (err) {

        console.error(
          `❌ Contact chunk ${chunkNum} error:`,
          err.message
        );

        if (err.writeErrors?.length > 0) {
          console.error(
            "First write error:",
            JSON.stringify(err.writeErrors[0].err, null, 2)
          );
        }

        if (err.result?.insertedCount) {
          successCount += err.result.insertedCount;
        }

        insertErrors.push(
          `Chunk ${chunkNum} fail: ${err.message}`
        );
      }

      await importLogRepository.update(importLog._id, {
        successCount,
      });
    }

    // =========================================
    // Final status
    // =========================================
    const finalStatus =
      successCount === 0
        ? "failed"
        : successCount < validRows.length
        ? "partial"
        : "completed";

    await importLogRepository.update(importLog._id, {
      successCount,
      failedCount:  errorDetails.length + insertErrors.length,
      errorDetails: [...errorDetails, ...insertErrors],
      status:       finalStatus,
    });

    fs.unlinkSync(filePath);

    // =========================================
    // Notification
    // =========================================
    await notificationService.create({
      userId,
      type: "import_complete",
      message:
        `Contact import ${finalStatus} — ` +
        `${successCount} of ${totalRows} contacts imported. ` +
        `Linked: ${linked}, Unlinked: ${unlinked}`,
      refId: importLog._id,
      refCollection: "importLogs",
    });

    console.log(
      `🏁 Contact import done — ${successCount}/${totalRows} | Linked: ${linked}`
    );

    return {
      importLogId: importLog._id,
      totalRows,
      successCount,
      failedCount: errorDetails.length + insertErrors.length,
      errorDetails: [...errorDetails, ...insertErrors],
      linked,
      unlinked,
      status: finalStatus,
    };
  },

  // =========================================
  // Get Import Status
  // =========================================
  getImportStatus: async (importLogId) => {
    return await importLogRepository.findById(importLogId);
  },
};

export default importService;