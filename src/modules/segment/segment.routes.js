import { Router }        from "express";
import segmentController from "./segment.controller.js";
import authMiddleware    from "../../common/middlewares/auth.middleware.js";
import { adminOnly, editorPlus, viewerPlus } from "../../common/middlewares/rbac.middleware.js";

const router = Router();
router.use(authMiddleware);

// ── Specific routes PEHLE register karo /:id se conflict avoid karne ke liye ─
router.post("/preview",              segmentController.preview);
router.post("/:id/sync",             segmentController.sync);
router.post("/:id/add-accounts",     segmentController.addAccounts);   // ← NEW
router.post("/:id/enrich-score",     segmentController.enrichAndScore);  // NEW
router.get("/:id/accounts",          segmentController.getAccounts);

router.post("/",   editorPlus,  segmentController.create);
router.get("/",    viewerPlus,  segmentController.getAll);
router.get("/:id", viewerPlus,  segmentController.getById);
router.put("/:id", editorPlus,  segmentController.update);
router.delete("/:id", adminOnly, segmentController.delete);

export default router;
