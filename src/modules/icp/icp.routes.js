import { Router } from "express";
import { body } from "express-validator";
import icpController from "./icp.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";
import { INDUSTRIES } from "../../common/constants/taxonomy.js";

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
    .custom((arr) => arr.every((v) => INDUSTRIES.includes(v)))
    .withMessage("Invalid industry value"),

  body("commercialSectors")
    .optional()
    .isArray().withMessage("commercialSectors must be an array")
    .custom((arr) => arr.every((v) => INDUSTRIES.includes(v)))
    .withMessage("Invalid commercial sector value"),

  body("subSectors")
    .optional()
    .isArray().withMessage("subSectors must be an array"),

  body("mappedIndustries")
    .optional()
    .isArray().withMessage("mappedIndustries must be an array"),

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

  body("buyerPersona.functionalDomains")
    .optional()
    .isArray().withMessage("functionalDomains must be an array"),

  body("buyerPersona.seniorityLevels")
    .optional()
    .isArray().withMessage("seniorityLevels must be an array"),

  body("buyerPersona.designations")
    .optional()
    .isArray().withMessage("designations must be an array"),

  body("description")
    .optional({ nullable: true })
    .isString().withMessage("description must be a string"),

  body("commercialCategories")
    .optional()
    .isArray().withMessage("commercialCategories must be an array"),

  body("targetRegionsInclude")
    .optional()
    .isArray().withMessage("targetRegionsInclude must be an array"),

  body("targetRegionsExclude")
    .optional()
    .isArray().withMessage("targetRegionsExclude must be an array"),

  body("targetRegionCountriesExclude")
    .optional()
    .isArray().withMessage("targetRegionCountriesExclude must be an array"),

  body("targetCountriesInclude")
    .optional()
    .isArray().withMessage("targetCountriesInclude must be an array"),

  body("targetCountriesExclude")
    .optional()
    .isArray().withMessage("targetCountriesExclude must be an array"),

  body("techStackInclude")
    .optional()
    .isArray().withMessage("techStackInclude must be an array"),

  body("techStackExclude")
    .optional()
    .isArray().withMessage("techStackExclude must be an array"),

  body("techCategoriesInclude")
    .optional()
    .isArray().withMessage("techCategoriesInclude must be an array"),

  body("techCategoriesExclude")
    .optional()
    .isArray().withMessage("techCategoriesExclude must be an array"),
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