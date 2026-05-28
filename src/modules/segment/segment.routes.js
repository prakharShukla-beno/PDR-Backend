import { Router } from "express";
import segmentController from "./segment.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();
router.use(authMiddleware);

// Preview must be before /:id to avoid route conflict
router.post("/preview",          segmentController.preview);      // ← naya

router.post("/",                 segmentController.create);
router.get("/",                  segmentController.getAll);
router.get("/:id",               segmentController.getById);
router.put("/:id",               segmentController.update);
router.delete("/:id",            segmentController.delete);
router.get("/:id/prospects",     segmentController.getProspects);

export default router;