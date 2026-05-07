import { Router } from "express";
import { body } from "express-validator";
import prospectController from "./prospect.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

// All prospect routes require login
router.use(authMiddleware);

// Validation rules for create
const createValidation = [
  body("accountName")
    .trim()
    .notEmpty()
    .withMessage("Account name is required"),
  body("source")
    .notEmpty()
    .withMessage("Source is required")
    .isIn(["excel", "apollo", "zoominfo"])
    .withMessage("Source must be excel, apollo, or zoominfo"),
  body("importLogId")
    .notEmpty()
    .withMessage("Import log ID is required")
    .isMongoId()
    .withMessage("Invalid import log ID"),
  body("contacts.*.email")
    .optional()
    .isEmail()
    .withMessage("Invalid contact email"),
  body("techFitScore")
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage("Tech fit score must be between 0 and 100"),
];

router.post("/", createValidation, prospectController.create);
router.get("/", prospectController.getAll);
router.get("/:id", prospectController.getById);
router.put("/:id", prospectController.update);
router.delete("/:id", prospectController.delete);

export default router;