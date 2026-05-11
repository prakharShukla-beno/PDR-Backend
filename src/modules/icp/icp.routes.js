import { Router } from "express";
import { body } from "express-validator";
import icpController from "./icp.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

// Validation — create/update ke liye
const icpValidation = [
  body("name")
    .notEmpty().withMessage("ICP profile name is required")
    .isString().withMessage("name must be a string"),

  body("industries")
    .optional()
    .isArray().withMessage("industries must be an array")
    .custom((arr) => {
      const valid = ["BFSI", "IT & ITES", "Media & Telecom", "Retail & CPG", "Healthcare"];
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

// POST   /api/icp                        — naya ICP profile banao
// GET    /api/icp                        — saare profiles (?isActive=true&page&limit)
// GET    /api/icp/:id                    — single profile detail
// PUT    /api/icp/:id                    — profile update karo
// DELETE /api/icp/:id                    — profile delete karo
// GET    /api/icp/:id/match-prospects    — ICP criteria se matching prospects
// GET    /api/icp/:id/match-persona      — buyer persona se best POC dhundo

router.post("/",                        icpValidation, icpController.create);
router.get("/",                         icpController.getAll);
router.get("/:id",                      icpController.getById);
router.put("/:id",                      icpValidation, icpController.update);
router.delete("/:id",                   icpController.delete);
router.get("/:id/match-prospects",      icpController.matchProspects);
router.get("/:id/match-persona",        icpController.matchBuyerPersona);

export default router;