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

      const result = await importService.processExcelImport(
        req.file.path,
        req.user._id
      );

      res.status(200).json({
        success: true,
        message: `Import ${result.status} — ${result.successCount} of ${result.totalRows} rows imported`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default importController;