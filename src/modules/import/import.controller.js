import importService from "./import.service.js";
import ImportJob from "./importJob.model.js";
import { startImportWorker } from "./importJob.processor.js";
import { getCompanyIdFromRequest } from "../../common/utils/tenantScope.js";

const ACTIVE_STATUSES = ["pending", "importing", "processing"];

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

      const skippedSuffix = result.skippedCount > 0
        ? ` ${result.skippedCount} skipped (missing required fields).`
        : "";

      return res.status(200).json({
        success: true,
        message: (result.hasDuplicates
          ? `${result.successCount} records saved. ${result.duplicates.length} duplicates need your review.`
          : `Import complete — ${result.successCount} of ${result.totalRows} records saved.`) + skippedSuffix,
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
          message: "No file uploaded",
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

      res.status(202).json({
        success: true,
        message: "Import started",
        data: { jobId: job._id, status: "pending" },
      });

      const filePath = req.file.path;

      setTimeout(() => {
        startImportWorker(job._id.toString(), filePath, companyId).catch(
          (err) => {
            console.error("Import worker crashed:", err.message);
            ImportJob.findByIdAndUpdate(job._id, {
              status: "failed",
              errorMessage: err.message,
            }).catch(() => {});
          }
        );
      }, 100);
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
