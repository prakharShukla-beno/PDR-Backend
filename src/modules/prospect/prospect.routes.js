import { Router } from "express";
import { body }   from "express-validator";
import prospectController from "./prospect.controller.js";
import authMiddleware     from "../../common/middlewares/auth.middleware.js";

const router = Router();
router.use(authMiddleware);

const createValidation = [
  body("accountName").trim().notEmpty().withMessage("Account name is required"),
  body("contacts.*.email").optional().isEmail().withMessage("Invalid contact email"),
  body("techFitScore").optional().isInt({ min: 0, max: 100 }).withMessage("Tech fit score must be between 0 and 100"),
];

// ── These 3 routes must come BEFORE /:id routes ───────────────────────────────
// Otherwise Express will try to match "export", "re-tier" as an :id param

// Download all prospects as Excel
router.get("/export",   prospectController.export);

// Run scoring formula on ALL prospects and save results
// POST body: {} (no body needed, processes everything)
router.post("/re-tier", prospectController.bulkReTier);

// ── Standard CRUD ─────────────────────────────────────────────────────────────
router.post("/",        createValidation, prospectController.create);
router.get("/",         prospectController.getAll);
router.get("/:id",      prospectController.getById);
router.put("/:id",      prospectController.update);
router.delete("/:id",   prospectController.delete);

// ── Scoring routes — must come AFTER /:id to avoid conflict ───────────────────

// Calculate and save score for one prospect
// Returns score + full breakdown
router.post("/:id/calculate-score", prospectController.calculateScore);

// Get score breakdown without saving (read-only, for display)
router.get("/:id/score-breakdown",  prospectController.getScoreBreakdown);

// Manually override tier/priority (when formula result is wrong)
// Body: { clvRanking, salesPriority, overrideReason }
router.put("/:id/override-tier",    prospectController.overrideTier);

export default router;
