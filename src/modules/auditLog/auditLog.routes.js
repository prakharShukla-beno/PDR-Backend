import { Router } from "express";
import auditLogController from "./auditLog.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();
router.use(authMiddleware);

// GET /api/audit-logs?userId=&entity=&action=&page=&limit=
router.get("/", auditLogController.getAll);

export default router;