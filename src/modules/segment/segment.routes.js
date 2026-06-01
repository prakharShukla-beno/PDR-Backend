import { Router } from "express";
import segmentController from "./segment.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();
router.use(authMiddleware);

// Preview and sync before /:id to avoid route conflict
router.post("/preview",          segmentController.preview);
router.post("/:id/sync",         segmentController.sync);
router.get("/:id/accounts",      segmentController.getAccounts);

router.post("/",                 segmentController.create);
router.get("/",                  segmentController.getAll);
router.get("/:id",               segmentController.getById);
router.put("/:id",               segmentController.update);
router.delete("/:id",            segmentController.delete);

export default router;