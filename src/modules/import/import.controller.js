import importService from "./import.service.js";

const importController = {

  // POST /api/import/excel/preview — parse headers, detect missing ICP columns
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

  // POST /api/import/excel
  // Upload file — save non-duplicates and return duplicates to the user
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
      const userId   = req.user._id;

      // Wait for result — duplicates require a user decision
      const result = await importService.processExcelImport(filePath, userId);

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

  // POST /api/import/resolve-duplicates
  // Process user decisions — merge / skip / keep_both
  resolveDuplicates: async (req, res, next) => {
    try {
      const { importLogId, decisions } = req.body;

      if (!importLogId || !decisions || !Array.isArray(decisions)) {
        return res.status(400).json({
          success: false,
          message: "importLogId and decisions array are required.",
        });
      }

      const result = await importService.resolveDuplicates({
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

  // GET /api/import/status/:importLogId
  getStatus: async (req, res, next) => {
    try {
      const { importLogId } = req.params;
      const status = await importService.getImportStatus(importLogId);

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