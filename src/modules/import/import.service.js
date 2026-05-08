import fs from "fs";
import { processExcelFile } from "../../common/utils/excelParser.js";
import prospectRepository from "../prospect/prospect.repository.js";
import duplicateRepository from "../duplicate/duplicate.repository.js";
import importLogRepository from "../importLog/importLog.repository.js";
import notificationService from "../notification/notification.service.js";

const importService = {

  processExcelImport: async (filePath, userId) => {

    const { validRows, errorDetails, totalRows } = processExcelFile(filePath);

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

    for (const row of validRows) {
      try {
        const existingDuplicates = await prospectRepository.findDuplicates({
          accountName: row.accountName,
          website:     row.website,
        });

        const isDuplicate = existingDuplicates.length > 0;

        const prospect = await prospectRepository.create({
          ...row,
          isDuplicate,
          source:      "excel",
          importLogId: importLog._id,
        });

        if (isDuplicate) {
          const matchFields = [];
          if (row.accountName) matchFields.push("accountName");
          if (row.website)     matchFields.push("website");

          await duplicateRepository.create({
            prospectId1: existingDuplicates[0]._id,
            prospectId2: prospect._id,
            matchFields,
            status:      "pending",
          });

          // Duplicate detect hone pe notification
          await notificationService.create({
            userId:        userId,
            type:          "dedup_complete",
            message:       `Duplicate detected for "${row.accountName}" during import`,
            refId:         prospect._id,
            refCollection: "prospects",
          });
        }

        successCount++;
      } catch (err) {
        insertErrors.push(
          `Insert failed for row: ${row.accountName} — ${err.message}`
        );
      }
    }

    const finalStatus =
      successCount === 0          ? "failed"    :
      successCount < validRows.length ? "partial" :
      "completed";

    await importLogRepository.update(importLog._id, {
      successCount,
      failedCount:  errorDetails.length + insertErrors.length,
      errorDetails: [...errorDetails, ...insertErrors],
      status:       finalStatus,
    });

    fs.unlinkSync(filePath);

    // Import complete hone pe notification
    await notificationService.create({
      userId:        userId,
      type:          "import_complete",
      message:       `Import ${finalStatus} — ${successCount} of ${totalRows} rows imported successfully`,
      refId:         importLog._id,
      refCollection: "importLogs",
    });

    return {
      importLogId:  importLog._id,
      totalRows,
      successCount,
      failedCount:  errorDetails.length + insertErrors.length,
      errorDetails: [...errorDetails, ...insertErrors],
      status:       finalStatus,
    };
  },
};

export default importService;