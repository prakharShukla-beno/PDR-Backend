import { Router } from "express";
import { body } from "express-validator";
import icpController from "./icp.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

// Validation — for create/update
const icpValidation = [
  body("name")
    .notEmpty().withMessage("ICP profile name is required")
    .isString().withMessage("name must be a string"),

  body("industries")
    .optional()
    .isArray().withMessage("industries must be an array")
    .custom((arr) => {
      const valid = [
        "BFSI", "IT & ITES", "SaaS", "Fintech", "E-commerce",
        "Healthcare", "EdTech", "Logistics", "Manufacturing",
        "Retail & CPG", "Media & Telecom", "Real Estate",
      ];
      return arr.every((v) => valid.includes(v));
    }).withMessage("Invalid industry value"),

  body("businessModels")
    .optional()
    .isArray().withMessage("businessModels must be an array"),

  body("countries")
    .optional()
    .isArray().withMessage("countries must be an array"),

  body("annualRevenues")
    .optional()
    .isArray().withMessage("annualRevenues must be an array"),

  body("employeeRanges")
    .optional()
    .isArray().withMessage("employeeRanges must be an array"),

  body("minTechFitScore")
    .optional()
    .isInt({ min: 0, max: 100 }).withMessage("minTechFitScore must be between 0 and 100"),

  body("buyerPersona.targetSeniorities")
    .optional()
    .isArray().withMessage("targetSeniorities must be an array"),

  body("buyerPersona.targetDepartments")
    .optional()
    .isArray().withMessage("targetDepartments must be an array"),

  body("buyerPersona.targetDesignations")
    .optional()
    .isArray().withMessage("targetDesignations must be an array"),
];

// POST   /api/icp                        — create a new ICP profile
// GET    /api/icp                        — list profiles (?isActive=true&page&limit)
// GET    /api/icp/:id                    — get single profile detail
// PUT    /api/icp/:id                    — update an ICP profile
// DELETE /api/icp/:id                    — delete an ICP profile
// GET    /api/icp/:id/match-prospects    — match prospects by ICP criteria
// GET    /api/icp/:id/match-persona      — find best POC by buyer persona

router.post("/",                        icpValidation, icpController.create);
router.get("/",                         icpController.getAll);
router.get("/:id",                      icpController.getById);
router.put("/:id",                      icpValidation, icpController.update);
router.delete("/:id",                   icpController.delete);
router.get("/:id/match-prospects",      icpController.matchProspects);
router.get("/:id/match-persona",        icpController.matchBuyerPersona);

export default router;