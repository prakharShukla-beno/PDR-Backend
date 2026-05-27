import contactImportService from "./contactImport.service.js";
import importLogRepository from "../importLog/importLog.repository.js";

const contactImportController = {

  // POST /api/import/contacts
  uploadFile: async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded. Please upload an Excel or CSV file.",
        });
      }

      // File type check
      const allowedTypes = /\.(xlsx|xls|csv)$/i;
      if (!req.file.originalname.match(allowedTypes)) {
        return res.status(400).json({
          success: false,
          message: "Invalid file type. Only .xlsx, .xls and .csv files are allowed.",
        });
      }

      const filePath = req.file.path;
      const userId   = req.user._id;

      // Process in background
      contactImportService.processContactImport(filePath, userId)
        .then((result) => {
          console.info(`Contact import complete: ${result.successCount} of ${result.totalRows}`);
        })
        .catch((err) => {
          console.error("Contact import error:", err.message);
        });

      return res.status(202).json({
        success: true,
        message: "Contact import started — processing in background. A notification will be sent when complete.",
        data: {
          fileName:   req.file.originalname,
          fileSize:   `${(req.file.size / 1024).toFixed(1)} KB`,
          uploadedAt: new Date().toISOString(),
        },
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
        return res.status(404).json({
          success: false,
          message: "Import log not found",
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
          createdAt: status.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

export default contactImportController;