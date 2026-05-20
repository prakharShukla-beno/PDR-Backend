import { Router } from "express";
import segmentController from "./segment.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();
router.use(authMiddleware);

router.post("/",                    segmentController.create);
router.get("/",                     segmentController.getAll);
router.get("/:id",                  segmentController.getById);
router.put("/:id",                  segmentController.update);
router.delete("/:id",               segmentController.delete);
router.get("/:id/prospects",        segmentController.getProspects);

export default router;