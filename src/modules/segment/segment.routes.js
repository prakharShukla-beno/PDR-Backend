import { Router }        from "express";
import segmentController from "./segment.controller.js";
import authMiddleware    from "../../common/middlewares/auth.middleware.js";
import { adminOnly, editorPlus, viewerPlus } from "../../common/middlewares/rbac.middleware.js";

const router = Router();
router.use(authMiddleware);

router.post("/preview",              editorPlus,  segmentController.preview);
router.post("/:id/sync",             editorPlus,  segmentController.sync);
router.post("/:id/enrich-score",     editorPlus,  segmentController.enrichAndScore);
router.get("/:id/accounts",          viewerPlus,  segmentController.getAccounts);

router.post("/",   editorPlus,  segmentController.create);
router.get("/",    viewerPlus,  segmentController.getAll);
router.get("/:id", viewerPlus,  segmentController.getById);
router.put("/:id", editorPlus,  segmentController.update);
router.delete("/:id", adminOnly, segmentController.delete);

export default router;
