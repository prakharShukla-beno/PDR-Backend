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

      res.status(200).json({
        success: true,
        data: duplicate,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/duplicates/:id/dismiss — mark as not a duplicate
  dismiss: async (req, res, next) => {
    try {
      const updated = await duplicateService.dismiss(req.params.id, req.user._id);

      res.status(200).json({
        success: true,
        message: "Duplicate dismissed — both prospects kept separately",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/duplicates/:id/merge — merge prospectId2 into prospectId1
  merge: async (req, res, next) => {
    try {
      const result = await duplicateService.merge(req.params.id, req.user._id);

      res.status(200).json({
        success: true,
        message: "Prospects merged successfully — duplicate removed",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default duplicateController;