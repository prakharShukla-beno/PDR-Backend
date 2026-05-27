import { Router } from "express";
import duplicateController from "./duplicate.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

// All duplicate routes require login
router.use(authMiddleware);

// GET /api/duplicates              — all pairs (?status=pending/merged/dismissed)
// GET /api/duplicates/:id          — single pair full detail
// PUT /api/duplicates/:id/dismiss  — dismiss (keep both records separate)
// PUT /api/duplicates/:id/merge    — merge (merge prospectId2 into prospectId1)

router.get("/",              duplicateController.getAll);
router.get("/:id",           duplicateController.getById);
router.put("/:id/dismiss",   duplicateController.dismiss);
router.put("/:id/merge",     duplicateController.merge);

export default router;