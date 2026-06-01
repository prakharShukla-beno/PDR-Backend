import { Router } from "express";
import { body } from "express-validator";
import interactionController from "./interaction.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

// All routes require login
router.use(authMiddleware);

// Validation — for create
const createValidation = [
  body("prospectId")
    .notEmpty().withMessage("prospectId is required")
    .isMongoId().withMessage("prospectId must be a valid MongoDB ID"),

  body("type")
    .notEmpty().withMessage("type is required")
    .isIn(["Email", "Call", "Meeting", "LinkedIn DM", "Demo", "Follow-Up", "Event"])
    .withMessage("Invalid interaction type"),

  body("interactedAt")
    .notEmpty().withMessage("interactedAt is required")
    .isISO8601().withMessage("interactedAt must be a valid date (ISO 8601)"),

  body("outcome")
    .optional()
    .isIn(["Positive", "Neutral", "Negative", "No Response"])
    .withMessage("Invalid outcome value"),

  body("notes")
    .optional()
    .isString().withMessage("notes must be a string"),
];

// Validation — for update (all optional)
const updateValidation = [
  body("type")
    .optional()
    .isIn(["Email", "Call", "Meeting", "LinkedIn DM", "Demo", "Follow-Up", "Event"])
    .withMessage("Invalid interaction type"),

  body("outcome")
    .optional()
    .isIn(["Positive", "Neutral", "Negative", "No Response"])
    .withMessage("Invalid outcome value"),

  body("interactedAt")
    .optional()
    .isISO8601().withMessage("interactedAt must be a valid date (ISO 8601)"),
];

// POST   /api/interactions                          — log a new interaction
// GET    /api/interactions/prospect/:prospectId     — get all interactions for a prospect
// GET    /api/interactions/:id                      — get single interaction
// PUT    /api/interactions/:id                      — update an interaction
// DELETE /api/interactions/:id                      — delete an interaction

router.post("/",                              createValidation, interactionController.create);
router.get("/prospect/:prospectId",           interactionController.getByProspectId);
router.get("/:id",                            interactionController.getById);
router.put("/:id",                            updateValidation, interactionController.update);
router.delete("/:id",                         interactionController.delete);

export default router;