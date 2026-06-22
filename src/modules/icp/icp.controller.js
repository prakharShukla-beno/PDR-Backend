import { validationResult } from "express-validator";
import icpService from "./icp.service.js";
import { getCompanyIdFromRequest } from "../../common/utils/tenantScope.js";

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

      const companyId = getCompanyIdFromRequest(req);
      const profile = await icpService.create(req.body, req.user._id, companyId);

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
      const companyId = getCompanyIdFromRequest(req);
      const { page, limit, isActive } = req.query;
      const result = await icpService.getAll({ page, limit, isActive, companyId });

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
      const companyId = getCompanyIdFromRequest(req);
      const profile = await icpService.getById(req.params.id, companyId);
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

      const companyId = getCompanyIdFromRequest(req);
      const profile = await icpService.update(req.params.id, req.body, companyId);
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
      const companyId = getCompanyIdFromRequest(req);
      const result = await icpService.delete(req.params.id, companyId);
      res.status(200).json({ success: true, message: result.message });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/icp/:id/create-segment — create segment from ICP matches
  createSegment: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const segment = await icpService.createSegmentFromIcp(
        req.params.id,
        req.user._id,
        companyId,
        { name: req.body?.name, isShared: req.body?.isShared }
      );

      res.status(201).json({
        success: true,
        message: `Segment created with ${segment.matchCount} matching accounts`,
        data: segment,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/icp/:id/match-prospects — match prospects using ICP criteria
  matchProspects: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const { page, limit } = req.query;
      const result = await icpService.matchProspects(req.params.id, { page, limit, companyId });

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

  // GET /api/icp/benchmark — get company benchmark ICP
  getBenchmark: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const profile = await icpService.getBenchmark(companyId);
      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "No benchmark ICP set",
        });
      }
      res.status(200).json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/icp/:id/set-benchmark — mark ICP as company benchmark
  setBenchmark: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const profile = await icpService.setBenchmark(req.params.id, companyId);
      res.status(200).json({
        success: true,
        message: "ICP set as benchmark successfully",
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/icp/:id/match-persona — find best POC using buyer persona
  matchBuyerPersona: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const { page, limit } = req.query;
      const result = await icpService.matchBuyerPersona(req.params.id, { page, limit, companyId });

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