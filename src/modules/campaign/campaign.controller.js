import { validationResult } from "express-validator";
import campaignService from "./campaign.service.js";

const campaignController = {

  // POST /api/campaigns
  create: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }

      const campaign = await campaignService.create(req.body, req.user._id);

      res.status(201).json({
        success: true,
        message: "Campaign created successfully",
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/campaigns
  getAll: async (req, res, next) => {
    try {
      const result = await campaignService.getAll(req.query);

      res.status(200).json({
        success: true,
        data:       result.campaigns,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/campaigns/:id
  getById: async (req, res, next) => {
    try {
      const campaign = await campaignService.getById(req.params.id);

      res.status(200).json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/campaigns/:id
  update: async (req, res, next) => {
    try {
      const updated = await campaignService.update(req.params.id, req.body);

      res.status(200).json({
        success: true,
        message: "Campaign updated successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/campaigns/:id
  delete: async (req, res, next) => {
    try {
      const result = await campaignService.delete(req.params.id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/campaigns/:id/prospects
  addProspects: async (req, res, next) => {
    try {
      const { prospectIds } = req.body;

      if (!prospectIds || prospectIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "prospectIds array is required",
        });
      }

      const updated = await campaignService.addProspects(
        req.params.id,
        prospectIds
      );

      res.status(200).json({
        success: true,
        message: "Prospects added to campaign",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/campaigns/:id/prospects/:prospectId
  removeProspect: async (req, res, next) => {
    try {
      const updated = await campaignService.removeProspect(
        req.params.id,
        req.params.prospectId
      );

      res.status(200).json({
        success: true,
        message: "Prospect removed from campaign",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default campaignController;