import { validationResult } from "express-validator";
import interactionService from "./interaction.service.js";

const interactionController = {

  // POST /api/interactions — log a new interaction
  create: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }

      const { prospectId, type, notes, outcome, interactedAt } = req.body;

      const interaction = await interactionService.create({
        prospectId,
        type,
        notes,
        outcome,
        conductedBy:  req.user._id,
        interactedAt,
      });

      res.status(201).json({
        success: true,
        message: "Interaction logged successfully",
        data: interaction,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/interactions/prospect/:prospectId — all interactions for a prospect
  getByProspectId: async (req, res, next) => {
    try {
      const { page, limit } = req.query;

      const result = await interactionService.getByProspectId({
        prospectId: req.params.prospectId,
        page,
        limit,
      });

      res.status(200).json({
        success:    true,
        data:       result.interactions,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/interactions/:id — single interaction detail
  getById: async (req, res, next) => {
    try {
      const interaction = await interactionService.getById(req.params.id);

      res.status(200).json({
        success: true,
        data: interaction,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/interactions/:id — update an interaction
  update: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }

      const interaction = await interactionService.update(req.params.id, req.body);

      res.status(200).json({
        success: true,
        message: "Interaction updated successfully",
        data: interaction,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/interactions/:id — delete an interaction
  delete: async (req, res, next) => {
    try {
      const result = await interactionService.delete(req.params.id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default interactionController;