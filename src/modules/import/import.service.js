import fs from "fs";
import { processExcelFile } from "../../common/utils/excelParser.js";
import prospectRepository from "../prospect/prospect.repository.js";
import duplicateRepository from "../duplicate/duplicate.repository.js";
import importLogRepository from "../importLog/importLog.repository.js";

const importService = {

  processExcelImport: async (filePath, userId) => {

    // Step 1: Parse and validate Excel file
    const { validRows, errorDetails, totalRows } = processExcelFile(filePath);

    //Step-2: Import log create and save the initial log with pending status and error details (if any)
    const importLog = await importLogRepository.create({
      fileName: filePath.split(/[\\/]/).pop(), // Sirf file name — full path nahi
      importType: "excel",
      uploadedBy: userId,
      totalRows,
      successCount: 0,   // Baad mein update hoga
      failedCount: errorDetails.length,
      errorDetails,
      status: "partial", // Baad mein update hoga
    });

    // Step 3: Save valid rows in db-with duplicate check and create duplicate pairs if needed
    let successCount = 0;
    const insertErrors = [];

    for (const row of validRows) {
      try {
        // Duplicate check
        const existingDuplicates = await prospectRepository.findDuplicates({
          accountName: row.accountName,
          website: row.website,
        });

        const isDuplicate = existingDuplicates.length > 0;

        // Prospect create karo
        const prospect = await prospectRepository.create({
          ...row,
          isDuplicate,
          source: "excel",
          importLogId: importLog._id,
        });

        // Duplicate pair record banao
        if (isDuplicate) {
          const matchFields = [];
          if (row.accountName) matchFields.push("accountName");
          if (row.website) matchFields.push("website");

          await duplicateRepository.create({
            prospectId1: existingDuplicates[0]._id,
            prospectId2: prospect._id,
            matchFields,
            status: "pending",
          });
        }

        successCount++;
      } catch (err) {
        insertErrors.push(`Insert failed for row: ${row.accountName} — ${err.message}`);
      }
    }

    // Step 4: Import log update karo final counts ke saath
    const finalStatus =
      successCount === 0 ? "failed" :
      successCount < validRows.length ? "partial" :
      "completed";

    await importLogRepository.update(importLog._id, {
      successCount,
      failedCount: errorDetails.length + insertErrors.length,
      errorDetails: [...errorDetails, ...insertErrors],
      status: finalStatus,
    });

    // Step 5: Uploaded file disk se delete karo — kaam ho gaya
    fs.unlinkSync(filePath);

    return {
      importLogId: importLog._id,
      totalRows,
      successCount,
      failedCount: errorDetails.length + insertErrors.length,
      errorDetails: [...errorDetails, ...insertErrors],
      status: finalStatus,
    };
  },
};

export default importService;