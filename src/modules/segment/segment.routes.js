import { Router }        from "express";
import segmentController from "./segment.controller.js";
import authMiddleware    from "../../common/middlewares/auth.middleware.js";

const router = Router();
router.use(authMiddleware);

// ── Specific routes PEHLE register karo /:id se conflict avoid karne ke liye ─
router.post("/preview",              segmentController.preview);
router.post("/:id/sync",             segmentController.sync);
router.post("/:id/enrich-score",     segmentController.enrichAndScore);  // NEW
router.get("/:id/accounts",          segmentController.getAccounts);

// ── CRUD routes ───────────────────────────────────────────────────────────────
router.post("/",   segmentController.create);
router.get("/",    segmentController.getAll);
router.get("/:id", segmentController.getById);
router.put("/:id", segmentController.update);
router.delete("/:id", segmentController.delete);

export default router;