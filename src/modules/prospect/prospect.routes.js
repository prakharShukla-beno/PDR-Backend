import { Router } from "express";
import { body } from "express-validator";
import prospectController from "./prospect.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();
router.use(authMiddleware);

const createValidation = [
  body("accountName").trim().notEmpty().withMessage("Account name is required"),
  body("contacts.*.email").optional().isEmail().withMessage("Invalid contact email"),
  body("techFitScore").optional().isInt({ min: 0, max: 100 }).withMessage("Tech fit score must be between 0 and 100"),
];

// Export must be before /:id to avoid route conflict
router.get("/export",  prospectController.export);

// ── FR-6: Scoring & Tiering Endpoints ────────────────────────────────────
router.post("/calculate-score/:id", prospectController.calculateScore);
router.post("/re-tier", prospectController.bulkReTier);
router.get("/:id/score-breakdown", prospectController.getScoreBreakdown);
router.put("/:id/override-tier", prospectController.overrideTier);

// ── Standard CRUD Routes ─────────────────────────────────────────────────
router.post("/",       createValidation, prospectController.create);
router.get("/",        prospectController.getAll);
router.get("/:id",     prospectController.getById);
router.put("/:id",     prospectController.update);
router.delete("/:id",  prospectController.delete);

export default router;