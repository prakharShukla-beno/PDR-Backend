import { Router } from "express";
import { body } from "express-validator";
import enrichmentController from "./enrichment.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";
import { editorPlus, viewerPlus } from "../../common/middlewares/rbac.middleware.js";

const router = Router();

router.use(authMiddleware);

const bulkValidation = [
  body("prospectIds")
    .isArray({ min: 1 })
    .withMessage("prospectIds must be a non-empty array"),
  body("prospectIds.*")
    .isMongoId()
    .withMessage("Each prospectId must be a valid MongoDB ID"),
];

router.post("/bulk",         editorPlus, bulkValidation, enrichmentController.enrichBulk);
router.post("/:prospectId", editorPlus, enrichmentController.enrichOne);
router.get("/:prospectId",  viewerPlus, enrichmentController.getOne);

export default router;
