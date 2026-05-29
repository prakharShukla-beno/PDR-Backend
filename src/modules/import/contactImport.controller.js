import contactImportService from "./contactImport.service.js";
import importLogRepository from "../importLog/importLog.repository.js";

const contactImportController = {

  // POST /api/import/contacts
  // Upload contact file — new ones save, duplicates return for review
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
      const result = await contactImportService.processContactImport(filePath, userId);

      return res.status(200).json({
        success: true,
        message: result.hasDuplicates
          ? `${result.successCount} contacts saved. ${result.duplicates.length} duplicates need your review.`
          : `Import complete — ${result.successCount} of ${result.totalRows} contacts saved.`,
        data: result,
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

      const result = await contactImportService.resolveContactDuplicates({
        importLogId,
        decisions,
        userId: req.user._id,
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
      const status = await importLogRepository.findById(req.params.importLogId);

      if (!status) {
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