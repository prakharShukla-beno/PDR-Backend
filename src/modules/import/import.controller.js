import importService from "./import.service.js";
import ImportJob from "./importJob.model.js";
import StagedRow from "./stagedRow.model.js";
import { parseExcelFile, detectMissingIcpColumns } from "../../common/utils/excelParser.js";
import { processImportJob, cancelImportJobIfRequested, parseExcelFileWithCancel } from "./importJob.processor.js";
import { getCompanyIdFromRequest } from "../../common/utils/tenantScope.js";

const STAGE_BATCH = 2000;
const ACTIVE_STATUSES = ["pending", "parsing", "processing"];

const runAsyncImport = async (jobId, fileBuffer, companyId, userId) => {
  try {
    await ImportJob.findByIdAndUpdate(jobId, {
      status: "parsing",
      startedAt: new Date(),
    });

    if (await cancelImportJobIfRequested(jobId)) return;

    const parsed = await parseExcelFileWithCancel(jobId, fileBuffer, parseExcelFile);
    if (!parsed) return;

    const { rows, headers } = parsed;
    const missingColumns = detectMissingIcpColumns(headers);

    if (await cancelImportJobIfRequested(jobId)) return;

    await ImportJob.findByIdAndUpdate(jobId, {
      totalRows: rows.length,
      missingIcpColumns: missingColumns,
    });

    const stagedDocs = rows.map((row, index) => ({
      jobId,
      rowIndex: index,
      rawData: row,
      processed: false,
    }));

    for (let i = 0; i < stagedDocs.length; i += STAGE_BATCH) {
      if (await cancelImportJobIfRequested(jobId)) return;

      await StagedRow.insertMany(
        stagedDocs.slice(i, i + STAGE_BATCH),
        { ordered: false }
      );
    }

    if (await cancelImportJobIfRequested(jobId)) return;

    await ImportJob.findByIdAndUpdate(jobId, { status: "processing" });
    await processImportJob(jobId, companyId, userId);
  } catch (err) {
    const existing = await ImportJob.findById(jobId).select("status").lean();
    if (existing?.status === "cancelled") return;

    console.error(`Import job ${jobId} failed:`, err);
    await StagedRow.deleteMany({ jobId });
    await ImportJob.findByIdAndUpdate(jobId, {
      status: "failed",
      errorMessage: err.message,
      completedAt: new Date(),
    });
  }
};

const importController = {

  previewExcel: async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded. Please upload an Excel file.",
        });
      }

      if (!req.file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
        return res.status(400).json({
          success: false,
          message: "Invalid file type. Only .xlsx, .xls and .csv files are allowed.",
        });
      }

      const preview = await importService.previewExcelImport(req.file.path);

      return res.status(200).json({
        success: true,
        data: preview,
      });
    } catch (error) {
      next(error);
    }
  },

  uploadExcel: async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded. Please upload an Excel file.",
        });
      }

      if (!req.file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
        return res.status(400).json({
          success: false,
          message: "Invalid file type. Only .xlsx, .xls and .csv files are allowed.",
        });
      }

      const filePath = req.file.path;
      const companyId = getCompanyIdFromRequest(req);
      const result = await importService.processExcelImport(filePath, {
        userId: req.user._id,
        companyId,
      });

      return res.status(200).json({
        success: true,
        message: result.hasDuplicates
          ? `${result.successCount} records saved. ${result.duplicates.length} duplicates need your review.`
          : `Import complete — ${result.successCount} of ${result.totalRows} records saved.`,
        data: result,
      });

    } catch (error) {
      next(error);
    }
  },

  importExcelAsync: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const userId = req.user._id ?? req.user.id;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded. Please upload an Excel file.",
        });
      }

      if (!req.file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
        return res.status(400).json({
          success: false,
          message: "Invalid file type. Only .xlsx, .xls and .csv files are allowed.",
        });
      }

      const job = await ImportJob.create({
        companyId,
        createdBy: userId,
        fileName: req.file.originalname,
        status: "pending",
      });

      const fileBuffer = Buffer.from(req.file.buffer);

      res.status(202).json({
        success: true,
        message: "Import queued for processing",
        data: {
          jobId: job._id,
          status: job.status,
        },
      });

      setImmediate(() => {
        runAsyncImport(job._id, fileBuffer, companyId, userId);
      });
    } catch (error) {
      next(error);
    }
  },

  getImportJobStatus: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const job = await ImportJob.findOne({
        _id: req.params.jobId,
        companyId,
      }).lean();

      if (!job) {
        return res.status(404).json({
          success: false,
          message: "Import job not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: job,
      });
    } catch (error) {
      next(error);
    }
  },

  getImportJobs: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const jobs = await ImportJob.find({ companyId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      return res.status(200).json({
        success: true,
        data: jobs,
      });
    } catch (error) {
      next(error);
    }
  },

  cancelImportJob: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const job = await ImportJob.findOneAndUpdate(
        {
          _id: req.params.jobId,
          companyId,
          status: { $in: ACTIVE_STATUSES },
        },
        {
          $set: {
            cancelRequested: true,
            status: "cancelled",
            completedAt: new Date(),
          },
        },
        { new: true }
      );

      if (!job) {
        const existing = await ImportJob.findOne({
          _id: req.params.jobId,
          companyId,
        }).select("status").lean();

        if (!existing) {
          return res.status(404).json({
            success: false,
            message: "Import job not found",
          });
        }

        return res.status(400).json({
          success: false,
          message: "This import has already finished and can't be cancelled",
        });
      }

      await StagedRow.deleteMany({ jobId: job._id, processed: false });

      console.log(`Import job ${job._id} cancelled via API`);

      return res.status(200).json({
        success: true,
        message: "Import cancelled",
        data: job,
      });
    } catch (error) {
      next(error);
    }
  },

  resolveDuplicates: async (req, res, next) => {
    try {
      const { importLogId, decisions } = req.body;

      if (!importLogId || !decisions || !Array.isArray(decisions)) {
        return res.status(400).json({
          success: false,
          message: "importLogId and decisions array are required.",
        });
      }

      const companyId = getCompanyIdFromRequest(req);
      const result = await importService.resolveDuplicates({
        importLogId,
        decisions,
        userId: req.user._id,
        companyId,
      });

      return res.status(200).json({
        success: true,
        message: `Duplicates resolved — ${result.merged} merged, ${result.skipped} skipped, ${result.kept_both} kept as new.`,
        data: result,
      });

    } catch (error) {
      next(error);
    }
  },

  getStatus: async (req, res, next) => {
    try {
      const { importLogId } = req.params;
      const companyId = getCompanyIdFromRequest(req);
      const status = await importService.getImportStatus(importLogId, companyId);

      if (!status) {
        return res.status(404).json({
          success: false,
          message: "Import log not found.",
        });
      }

      res.status(200).json({
        success: true,
        data: {
          importLogId:  status._id,
          fileName:     status.fileName,
          status:       status.status,
          totalRows:    status.totalRows,
          successCount: status.successCount,
          failedCount:  status.failedCount,
          progress:     status.totalRows > 0
            ? Math.round((status.successCount / status.totalRows) * 100)
            : 0,
          createdAt:    status.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

export default importController;
