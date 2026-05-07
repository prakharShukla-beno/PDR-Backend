import { validationResult } from "express-validator";
import prospectService from "./prospect.service.js";

const prospectController = {

  // POST /api/prospects
  create: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }

      const { prospect, isDuplicate } = await prospectService.create(
        req.body,
        req.user._id
      );

      res.status(201).json({
        success: true,
        message: isDuplicate
          ? "Prospect created — duplicate detected, flagged for review"
          : "Prospect created successfully",
        data: prospect,
        isDuplicate,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/prospects
  getAll: async (req, res, next) => {
    try {
      const result = await prospectService.getAll(req.query);

      res.status(200).json({
        success: true,
        data: result.prospects,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/prospects/:id
  getById: async (req, res, next) => {
    try {
      const prospect = await prospectService.getById(req.params.id);

      res.status(200).json({
        success: true,
        data: prospect,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/prospects/:id
  update: async (req, res, next) => {
    try {
      const updated = await prospectService.update(req.params.id, req.body);

      res.status(200).json({
        success: true,
        message: "Prospect updated successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/prospects/:id
  delete: async (req, res, next) => {
    try {
      const result = await prospectService.delete(req.params.id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default prospectController;