import { Router } from "express";
import { body } from "express-validator";
import enrichmentController from "./enrichment.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

// All enrichment routes require login
router.use(authMiddleware);

// Bulk validation — prospectIds array required
const bulkValidation = [
  body("prospectIds")
    .isArray({ min: 1 })
    .withMessage("prospectIds must be a non-empty array"),
  body("prospectIds.*")
    .isMongoId()
    .withMessage("Each prospectId must be a valid MongoDB ID"),
];

// POST /api/enrichment/bulk   — MUST be before /:prospectId (specific before param)
router.post("/bulk", bulkValidation, enrichmentController.enrichBulk);

// POST /api/enrichment/:prospectId  — trigger single enrichment
router.post("/:prospectId", enrichmentController.enrichOne);

// GET  /api/enrichment/:prospectId  — get saved enrichment result
router.get("/:prospectId", enrichmentController.getOne);

export default router;