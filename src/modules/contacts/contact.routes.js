import { Router } from "express";
import { body } from "express-validator";
import contactController from "./contact.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

const FUNCTIONAL_DOMAINS = [
  "Corporate Strategy",
  "Technology & Digital",
  "Data & AI",
  "Finance & Accounting",
  "Revenue & Growth",
  "Product & Creative",
  "Operations & Logistics",
  "People & HR",
  "Legal & Governance",
  "Healthcare & Life Sciences",
  "Industrial & Engineering",
  "Resources & Utilities",
  "Public Sector & NGO",
];

// Validation rules for create/update
const contactValidation = [
  body("accountId")
    .notEmpty().withMessage("accountId is required")
    .isMongoId().withMessage("Invalid accountId"),
  body("email")
    .optional()
    .isEmail().withMessage("Invalid email format"),
  body("secondaryEmail")
    .optional()
    .isEmail().withMessage("Invalid secondary email format"),
  body("functionalDomain")
    .optional()
    .isIn(FUNCTIONAL_DOMAINS).withMessage("Invalid functional domain"),
];

// ── Routes ────────────────────────────────────────────────────────────────────
router.post("/",                                    contactValidation, contactController.create);
router.get("/",                                     contactController.getAll);
router.get("/account/:accountId",                   contactController.getByAccountId);
router.get("/:id",                                  contactController.getById);
router.put("/:id",                                  contactController.update);
router.delete("/:id",                               contactController.delete);
router.post("/:id/campaigns/:campaignId",           contactController.addToCampaign);
router.delete("/:id/campaigns/:campaignId",         contactController.removeFromCampaign);

export default router;