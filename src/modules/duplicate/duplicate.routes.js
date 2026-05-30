import { Router } from "express";
import duplicateController from "./duplicate.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();
router.use(authMiddleware);

router.get("/",                duplicateController.getAll);
router.get("/:id",             duplicateController.getById);
router.post("/bulk",           duplicateController.bulkAction);    // NEW: bulk action
router.put("/:id/merge",       duplicateController.merge);
router.put("/:id/skip",        duplicateController.skip);
router.put("/:id/keep-both",   duplicateController.keepBoth);
router.put("/:id/dismiss",     duplicateController.dismiss);

export default router;
