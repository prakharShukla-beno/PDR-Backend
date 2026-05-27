import { validationResult } from "express-validator";
import contactService from "./contact.service.js";

const contactController = {

  // POST /api/contacts
  create: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }

      const contact = await contactService.create(req.body);

      res.status(201).json({
        success: true,
        message: "Contact created successfully",
        data: contact,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/contacts
  getAll: async (req, res, next) => {
    try {
      const result = await contactService.getAll(req.query);

      res.status(200).json({
        success: true,
        data:       result.contacts,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/contacts/:id
  getById: async (req, res, next) => {
    try {
      const contact = await contactService.getById(req.params.id);

      res.status(200).json({
        success: true,
        data: contact,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/contacts/account/:accountId  — all contacts for an account
  getByAccountId: async (req, res, next) => {
    try {
      const contacts = await contactService.getByAccountId(req.params.accountId);

      res.status(200).json({
        success: true,
        data: contacts,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/contacts/:id
  update: async (req, res, next) => {
    try {
      const updated = await contactService.update(req.params.id, req.body);

      res.status(200).json({
        success: true,
        message: "Contact updated successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/contacts/:id
  delete: async (req, res, next) => {
    try {
      const result = await contactService.delete(req.params.id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/contacts/:id/campaigns/:campaignId  — add contact to campaign
  addToCampaign: async (req, res, next) => {
    try {
      const { id, campaignId } = req.params;
      const updated = await contactService.addToCampaign(id, campaignId);

      res.status(200).json({
        success: true,
        message: "Contact added to campaign",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/contacts/:id/campaigns/:campaignId  — remove contact from campaign
  removeFromCampaign: async (req, res, next) => {
    try {
      const { id, campaignId } = req.params;
      const updated = await contactService.removeFromCampaign(id, campaignId);

      res.status(200).json({
        success: true,
        message: "Contact removed from campaign",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default contactController;