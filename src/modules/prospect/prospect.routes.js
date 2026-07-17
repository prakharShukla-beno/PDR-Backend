import { Router } from "express";
import { body }   from "express-validator";
import prospectController from "./prospect.controller.js";
import authMiddleware     from "../../common/middlewares/auth.middleware.js";
import { adminOnly, editorPlus, viewerPlus } from "../../common/middlewares/rbac.middleware.js";

const router = Router();
router.use(authMiddleware);

const createValidation = [
  body("accountName").trim().notEmpty().withMessage("Account name is required"),
  body("contacts.*.email").optional().isEmail().withMessage("Invalid contact email"),
  body("techFitScore").optional().isInt({ min: 0, max: 100 }).withMessage("Tech fit score must be between 0 and 100"),
];

router.get("/export",     viewerPlus,  prospectController.export);
router.get("/icp-stats",  viewerPlus,  prospectController.getIcpStats);
router.post("/re-tier",   editorPlus,  prospectController.bulkReTier);

router.post("/",        editorPlus,  createValidation, prospectController.create);
router.get("/",         viewerPlus,  prospectController.getAll);
router.get("/:id",      viewerPlus,  prospectController.getById);
router.put("/:id",      editorPlus,  prospectController.update);
router.delete("/:id",   adminOnly,   prospectController.delete);

router.post("/:id/calculate-score", editorPlus, prospectController.calculateScore);
router.get("/:id/score-breakdown",  viewerPlus, prospectController.getScoreBreakdown);
router.put("/:id/override-tier",    editorPlus, prospectController.overrideTier);
router.post("/:id/suggest-poc",     editorPlus, prospectController.suggestPoc);

export default router;
