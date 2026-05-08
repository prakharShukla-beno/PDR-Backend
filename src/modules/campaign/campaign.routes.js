import { Router } from "express";
import { body } from "express-validator";
import campaignController from "./campaign.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

// All campaign routes require login
router.use(authMiddleware);

// Validation for create
const createValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Campaign name is required"),
  body("prospectIds")
    .optional()
    .isArray()
    .withMessage("prospectIds must be an array"),
  body("prospectIds.*")
    .optional()
    .isMongoId()
    .withMessage("Each prospectId must be a valid MongoDB ID"),
  body("status")
    .optional()
    .isIn(["draft", "active", "completed"])
    .withMessage("Status must be draft, active, or completed"),
];

router.post("/",                                  createValidation, campaignController.create);
router.get("/",                                   campaignController.getAll);
router.get("/:id",                                campaignController.getById);
router.put("/:id",                                campaignController.update);
router.delete("/:id",                             campaignController.delete);
router.post("/:id/prospects",                     campaignController.addProspects);
router.delete("/:id/prospects/:prospectId",       campaignController.removeProspect);

export default router;