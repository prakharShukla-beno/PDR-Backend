import { Router } from "express";
import duplicateController from "./duplicate.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";
import { adminOnly, editorPlus } from "../../common/middlewares/rbac.middleware.js";

const router = Router();
router.use(authMiddleware);

router.get("/",              editorPlus, duplicateController.getAll);
router.get("/:id",           editorPlus, duplicateController.getById);
router.post("/bulk",         editorPlus, duplicateController.bulkAction);
router.delete("/:id",        adminOnly,  duplicateController.deleteDuplicate);
router.put("/:id/merge",     editorPlus, duplicateController.merge);
router.put("/:id/skip",      editorPlus, duplicateController.skip);
router.put("/:id/keep-both", editorPlus, duplicateController.keepBoth);
router.put("/:id/dismiss",   editorPlus, duplicateController.dismiss);

export default router;
