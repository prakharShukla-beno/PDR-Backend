import fs from "fs";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import ImportJob from "./importJob.model.js";
import Prospect from "../prospect/prospect.model.js";
import { validateAndNormalizeRow } from "../../common/utils/excelParser.js";

const INSERT_BATCH = 1000;

async function readAllRowsWithExcelJS(filePath) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
  });

  const rows = [];
  let headers = [];
  let isFirstRow = true;

  for await (const worksheet of workbook) {
    for await (const row of worksheet) {
      if (isFirstRow) {
        headers = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          headers[colNumber - 1] =
            cell.value != null ? String(cell.value).trim() : "";
        });
        isFirstRow = false;
        continue;
      }

      const obj = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (!header) return;
        let val = cell.value;
        if (val && typeof val === "object") {
          if (val.text) val = val.text;
          else if (val.result != null) val = val.result;
          else if (val.richText) {
            val = val.richText.map((t) => t.text).join("");
          } else {
            val = "";
          }
        }
        obj[header] = val != null ? String(val).trim() : "";
      });

      if (Object.values(obj).some((v) => v !== "")) {
        rows.push(obj);
      }
    }
  }

  return { rows, headers };
}

const buildProspectDoc = (prospectData, companyId, jobId) => {
  const now = new Date();
  return {
    ...prospectData,
    companyId: new mongoose.Types.ObjectId(companyId),
    importLogId: new mongoose.Types.ObjectId(jobId),
    accountNameLower: prospectData.accountName
      ? prospectData.accountName.toLowerCase().trim()
      : null,
    source: "excel",
    icpScoreStale: true,
    isDuplicate: false,
    createdAt: now,
    updatedAt: now,
  };
};

const insertProspectBatch = async (batch) => {
  try {
    const result = await Prospect.collection.insertMany(batch, {
      ordered: false,
    });
    return result.insertedCount ?? batch.length;
  } catch (bulkErr) {
    return bulkErr.result?.insertedCount ?? bulkErr.insertedCount ?? 0;
  }
};

export async function startImportWorker(jobId, filePath, companyId) {
  try {
    await ImportJob.findByIdAndUpdate(jobId, {
      status: "importing",
      startedAt: new Date(),
    });

    console.log(`Import ${jobId}: reading file with ExcelJS...`);
    const readStart = Date.now();

    const { rows } = await readAllRowsWithExcelJS(filePath);
    const readMs = Date.now() - readStart;
    console.log(`Import ${jobId}: read ${rows.length} rows in ${readMs}ms`);

    await ImportJob.findByIdAndUpdate(jobId, {
      totalRows: rows.length,
    });

    const toInsert = [];
    let errorCount = 0;
    const errorSamples = [];
    const validateStart = Date.now();

    let debugRowsLogged = 0;
    for (const rawRow of rows) {
      if (debugRowsLogged < 50) {
        console.log(`DEBUG async worker raw row #${debugRowsLogged}:`, JSON.stringify(rawRow));
        debugRowsLogged++;
      }
      try {
        const { isValid, normalizedRow, reason } = validateAndNormalizeRow(
          rawRow,
          2,
          { skipContacts: false }
        );
        if (!isValid) {
          errorCount++;
          if (errorSamples.length < 20) {
            errorSamples.push({ reason: reason || "Validation failed" });
          }
          continue;
        }
        const { contacts: _contacts, ...prospectData } = normalizedRow;
        toInsert.push(buildProspectDoc(prospectData, companyId, jobId));
      } catch {
        errorCount++;
      }
    }

    const validateMs = Date.now() - validateStart;
    console.log(
      `Import ${jobId}: validated ${rows.length} rows in ${validateMs}ms ` +
        `(${toInsert.length} valid, ${errorCount} errors)`
    );

    console.log(`Import ${jobId}: ${toInsert.length} valid rows, inserting...`);
    const insertStart = Date.now();
    let importedCount = 0;

    for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
      const batch = toInsert.slice(i, i + INSERT_BATCH);
      importedCount += await insertProspectBatch(batch);

      await ImportJob.findByIdAndUpdate(jobId, {
        importedCount,
        processedRows: Math.min(i + batch.length, toInsert.length),
      });
    }

    const insertMs = Date.now() - insertStart;
    console.log(
      `Import ${jobId}: inserted ${importedCount} rows in ${insertMs}ms`
    );

    await ImportJob.findByIdAndUpdate(jobId, {
      status: "completed",
      importedCount,
      successCount: importedCount,
      processedRows: rows.length,
      errorCount,
      errorSamples,
      completedAt: new Date(),
    });

    const totalMs = readMs + validateMs + insertMs;
    console.log(
      `Import ${jobId}: complete ✅ ${importedCount} imported, ${errorCount} skipped ` +
        `(missing/invalid required fields) (read ${readMs}ms + validate ${validateMs}ms + insert ${insertMs}ms = ${totalMs}ms)`
    );

    try {
      fs.unlinkSync(filePath);
    } catch {}
  } catch (err) {
    console.error(`Import ${jobId} failed:`, err.message);
    await ImportJob.findByIdAndUpdate(jobId, {
      status: "failed",
      errorMessage: err.message,
      completedAt: new Date(),
    }).catch(() => {});
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}
