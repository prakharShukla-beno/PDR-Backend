import contactImportService from "./contactImport.service.js";
import importLogRepository from "../importLog/importLog.repository.js";
import { getCompanyIdFromRequest } from "../../common/utils/tenantScope.js";

const contactImportController = {

  // POST /api/import/contacts
  // SYNC upload — waits for the full import to finish before responding.
  // Kept for backward compatibility / small files. Prefer uploadFileAsync
  // for the UI so large files don't hit request/proxy timeouts.
  uploadFile: async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded. Please upload an Excel or CSV file.",
        });
      }

      if (!req.file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
        return res.status(400).json({
          success: false,
          message: "Invalid file type. Only .xlsx, .xls and .csv files are allowed.",
        });
      }

      const filePath = req.file.path;
      const userId   = req.user._id;

      // Wait for result — duplicates need user decision
      const companyId = getCompanyIdFromRequest(req);
      const result = await contactImportService.processContactImport(filePath, {
        userId: req.user._id,
        companyId,
      });

      const unlinkedSuffix = result.unlinkedCount > 0 ? ` (${result.unlinkedCount} unlinked)` : "";
      const skippedSuffix  = result.skippedCount > 0
        ? ` ${result.skippedCount} skipped (missing email/name).`
        : "";

      return res.status(200).json({
        success: true,
        message: (result.hasDuplicates
          ? `${result.successCount} contacts saved${unlinkedSuffix}. ${result.duplicates.length} duplicates need your review.`
          : `Import complete — ${result.successCount} of ${result.totalRows} contacts saved${unlinkedSuffix}.`) + skippedSuffix,
        data: result,
      });

    } catch (error) {
      next(error);
    }
  },

  // POST /api/import/contacts/async
  // ASYNC upload — responds immediately with an importLogId while the
  // parsing/linking/insert work happens in the background. The frontend
  // should poll GET /api/import/contacts/status/:importLogId until the
  // status becomes "completed" | "partial" | "failed".
  uploadFileAsync: async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded. Please upload an Excel or CSV file.",
        });
      }

      if (!req.file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
        return res.status(400).json({
          success: false,
          message: "Invalid file type. Only .xlsx, .xls and .csv files are allowed.",
        });
      }

      const filePath   = req.file.path;
      const companyId  = getCompanyIdFromRequest(req);

      const { importLogId } = await contactImportService.processContactImportAsync(filePath, {
        userId: req.user._id,
        companyId,
      });

      return res.status(202).json({
        success: true,
        message: "Import started",
        data: { importLogId, status: "processing" },
      });

    } catch (error) {
      next(error);
    }
  },

  // POST /api/import/contacts/resolve-duplicates
  // Process user decisions for duplicate contacts
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
      const result = await contactImportService.resolveContactDuplicates({
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

  // GET /api/import/contacts/status/:importLogId
  getStatus: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const status = await importLogRepository.findById(req.params.importLogId);
      if (!status || status.companyId?.toString() !== companyId?.toString()) {
        return res.status(404).json({ success: false, message: "Import log not found" });
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
          createdAt: status.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

export default contactImportController;