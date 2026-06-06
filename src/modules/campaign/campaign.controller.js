import { validationResult } from "express-validator";
import campaignService from "./campaign.service.js";

const campaignController = {

  // Get all campaigns with pagination
  getAll: async (req, res, next) => {
    try {
      const result = await campaignService.getAll(req.query);
      res.status(200).json({
        success: true,
        data: result.campaigns,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get single campaign by ID
  getById: async (req, res, next) => {
    try {
      const campaign = await campaignService.getById(req.params.id);
      res.status(200).json({ success: true, data: campaign });
    } catch (error) {
      next(error);
    }
  },

  // Create new campaign
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

  // Update campaign details
  update: async (req, res, next) => {
    try {
      const campaign = await campaignService.update(req.params.id, req.body, req.user._id);
      res.status(200).json({
        success: true,
        message: "Campaign updated successfully",
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete campaign
  delete: async (req, res, next) => {
    try {
      const result = await campaignService.delete(req.params.id, req.user._id);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  // Add contacts to campaign (Apollo style)
  addContacts: async (req, res, next) => {
    try {
      const contactIds = req.body?.contactIds;
      if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "contactIds array is required",
        });
      }
      const campaign = await campaignService.addContacts(
        req.params.id, contactIds, req.user._id
      );
      res.status(200).json({
        success: true,
        message: `${contactIds.length} contact(s) added to campaign`,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  // Remove single contact from campaign
  removeContact: async (req, res, next) => {
    try {
      const result = await campaignService.removeContact(
        req.params.id, req.params.contactId, req.user._id
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  // Update campaign performance stats
  updateStats: async (req, res, next) => {
    try {
      const campaign = await campaignService.updateStats(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: "Stats updated",
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default campaignController;