import duplicateService from "./duplicate.service.js";

const duplicateController = {

  // GET /api/duplicates — all duplicate pairs
  getAll: async (req, res, next) => {
    try {
      const { page, limit, status } = req.query;
      const result = await duplicateService.getAll({ page, limit, status });
      res.status(200).json({
        success: true,
        data:       result.duplicates,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/duplicates/:id — single duplicate pair detail
  getById: async (req, res, next) => {
    try {
      const duplicate = await duplicateService.getById(req.params.id);
      res.status(200).json({ success: true, data: duplicate });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/duplicates/:id/dismiss
  dismiss: async (req, res, next) => {
    try {
      const updated = await duplicateService.dismiss(req.params.id, req.user._id);
      res.status(200).json({ success: true, message: "Duplicate dismissed — both prospects kept separately", data: updated });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/duplicates/:id/merge
  merge: async (req, res, next) => {
    try {
      const result = await duplicateService.merge(req.params.id, req.user._id);
      res.status(200).json({ success: true, message: "Merged successfully", data: result });
    } catch (error) { next(error); }
  },

  // PUT /api/duplicates/:id/skip
  skip: async (req, res, next) => {
    try {
      const result = await duplicateService.skip(req.params.id, req.user._id);
      res.status(200).json({ success: true, message: "Skipped — existing record kept", data: result });
    } catch (error) { next(error); }
  },

  // PUT /api/duplicates/:id/keep-both
  keepBoth: async (req, res, next) => {
    try {
      const result = await duplicateService.keepBoth(req.params.id, req.user._id);
      res.status(200).json({ success: true, message: "Saved as new record", data: result });
    } catch (error) { next(error); }
  },

  // DELETE /api/duplicates/:id — hard delete the duplicate record
  deleteDuplicate: async (req, res, next) => {
    try {
      const result = await duplicateService.deleteDuplicate(req.params.id, req.user._id);
      res.status(200).json({ success: true, message: "Duplicate record deleted", data: result });
    } catch (error) { next(error); }
  },

  // POST /api/duplicates/bulk — bulk action on multiple IDs
  bulkAction: async (req, res, next) => {
    try {
      const { ids, action } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: "ids array is required" });
      }
      if (!["merge", "skip", "keep-both", "delete"].includes(action)) {
        return res.status(400).json({ success: false, message: "action must be merge | skip | keep-both | delete" });
      }
      const result = await duplicateService.bulkAction(ids, action, req.user._id);
      res.status(200).json({ success: true, message: `Bulk ${action} done`, data: result });
    } catch (error) { next(error); }
  },
};

export default duplicateController;
