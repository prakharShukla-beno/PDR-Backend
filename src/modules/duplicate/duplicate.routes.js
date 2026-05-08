import { Router } from "express";
import duplicateController from "./duplicate.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

// All duplicate routes require login
router.use(authMiddleware);

// GET /api/duplicates              — saare pairs (?status=pending/merged/dismissed)
// GET /api/duplicates/:id          — single pair full detail
// PUT /api/duplicates/:id/dismiss  — dismiss karo (dono alag rakho)
// PUT /api/duplicates/:id/merge    — merge karo (prospectId2 → prospectId1)

router.get("/",              duplicateController.getAll);
router.get("/:id",           duplicateController.getById);
router.put("/:id/dismiss",   duplicateController.dismiss);
router.put("/:id/merge",     duplicateController.merge);

export default router;