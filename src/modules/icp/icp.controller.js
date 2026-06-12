import { validationResult } from "express-validator";
import icpService from "./icp.service.js";

const icpController = {

  // POST /api/icp — naya ICP profile banao
  create: async (req, res, next) => {
    try {
      console.log("[ICP create] req.body:", JSON.stringify(req.body, null, 2));

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }

      const profile = await icpService.create(req.body, req.user._id);

      res.status(201).json({
        success: true,
        message: "ICP profile created successfully",
        data: profile,
      });
    } catch (error) {
      console.error("[ICP create] error:", error.message);
      if (error.errors) {
        console.error("[ICP create] validation details:", JSON.stringify(error.errors, null, 2));
      }
      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: error.message,
          errors: Object.entries(error.errors || {}).map(([field, err]) => ({
            field,
            message: err.message,
          })),
        });
      }
      next(error);
    }
  },

  // GET /api/icp — saare profiles
  getAll: async (req, res, next) => {
    try {
      const { page, limit, isActive } = req.query;
      const result = await icpService.getAll({ page, limit, isActive });

      res.status(200).json({
        success:    true,
        data:       result.profiles,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/icp/:id — single profile
  getById: async (req, res, next) => {
    try {
      const profile = await icpService.getById(req.params.id);
      res.status(200).json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/icp/:id — update the profile
  update: async (req, res, next) => {
    try {
      console.log("[ICP update] req.body:", JSON.stringify(req.body, null, 2));

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }

      const profile = await icpService.update(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: "ICP profile updated successfully",
        data: profile,
      });
    } catch (error) {
      console.error("[ICP update] error:", error.message);
      if (error.errors) {
        console.error("[ICP update] validation details:", JSON.stringify(error.errors, null, 2));
      }
      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: error.message,
          errors: Object.entries(error.errors || {}).map(([field, err]) => ({
            field,
            message: err.message,
          })),
        });
      }
      next(error);
    }
  },

  // DELETE /api/icp/:id — delete the profile
  delete: async (req, res, next) => {
    try {
      const result = await icpService.delete(req.params.id);
      res.status(200).json({ success: true, message: result.message });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/icp/:id/match-prospects — match prospects using ICP criteria
  matchProspects: async (req, res, next) => {
    try {
      const { page, limit } = req.query;
      const result = await icpService.matchProspects(req.params.id, { page, limit });

      res.status(200).json({
        success:    true,
        data:       result.prospects,
        icpProfile: result.icpProfile,
        pagination: result.pagination,
        diagnosis:  result.diagnosis || {},
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/icp/:id/match-persona — find best POC using buyer persona
  matchBuyerPersona: async (req, res, next) => {
    try {
      const { page, limit } = req.query;
      const result = await icpService.matchBuyerPersona(req.params.id, { page, limit });

      res.status(200).json({
        success:      true,
        data:         result.prospects,
        icpProfile:   result.icpProfile,
        buyerPersona: result.buyerPersona,
        pagination:   result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default icpController;