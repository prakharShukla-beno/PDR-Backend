import importService from "./import.service.js";

const importController = {

  // POST /api/import/excel
  uploadExcel: async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded. Please upload an Excel file.",
        });
      }

      // Only .xlsx allowed
      if (!req.file.originalname.match(/\.(xlsx|xls)$/i)) {
        return res.status(400).json({
          success: false,
          message: "Invalid file type. Only .xlsx and .xls files are allowed.",
        });
      }

      // ── Turant browser ko response do ─────────────────────────────────────
      // Background mein process hoga — browser wait nahi karega
      const filePath = req.file.path;
      const userId   = req.user._id;

      // Background mein start karo — await mat karo
      importService.processExcelImport(filePath, userId)
        .then((result) => {
          console.log(`✅ Import complete — ${result.successCount} of ${result.totalRows} rows`);
        })
        .catch((err) => {
          console.error("❌ Import background error:", err.message);
        });

      // Browser ko 202 Accepted — kaam shuru ho gaya
      return res.status(202).json({
        success: true,
        message: "Import shuru ho gaya — background mein process ho raha hai. Notification aayegi jab complete ho.",
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

  // GET /api/import/status/:importLogId
  // Frontend poll kar sakta hai — progress check karne ke liye
  getStatus: async (req, res, next) => {
    try {
      const { importLogId } = req.params;
      const status = await importService.getImportStatus(importLogId);

      if (!status) {
        return res.status(404).json({
          success: false,
          message: "Import log nahi mila.",
        });
      }

      res.status(200).json({
        success: true,
        data: {
          importLogId:  status._id,
          fileName:     status.fileName,
          status:       status.status,       // processing / completed / failed / partial
          totalRows:    status.totalRows,
          successCount: status.successCount,
          failedCount:  status.failedCount,
          progress:     status.totalRows > 0
            ? Math.round((status.successCount / status.totalRows) * 100)
            : 0,                             // percentage 0-100
          createdAt:    status.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

export default importController;