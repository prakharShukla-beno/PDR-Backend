import { validationResult } from "express-validator";
import enrichmentService from "./enrichment.service.js";

const enrichmentController = {

  // POST /api/enrichment/:prospectId — single prospect enrich karo
  enrichOne: async (req, res, next) => {
    try {
      const { prospectId } = req.params;

      const enrichment = await enrichmentService.enrichOne(prospectId, req.user._id);

      res.status(200).json({
        success: true,
        message: "Prospect enriched successfully",
        data: enrichment,
      });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/enrichment/bulk — multiple prospects ek saath enrich karo
  enrichBulk: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }

      const { prospectIds } = req.body;

      const result = await enrichmentService.enrichBulk(prospectIds, req.user._id);

      res.status(200).json({
        success: true,
        message: `Bulk enrichment complete — ${result.successCount} of ${result.total} enriched`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/enrichment/:prospectId — prospect ka saved enrichment fetch karo
  getOne: async (req, res, next) => {
    try {
      const { prospectId } = req.params;

      const enrichment = await enrichmentService.getByProspectId(prospectId);

      res.status(200).json({
        success: true,
        data: enrichment,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default enrichmentController;