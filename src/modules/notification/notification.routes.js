import { Router } from "express";
import notificationController from "./notification.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

// All notification routes require login
router.use(authMiddleware);

// GET  /api/notifications              — saari notifications (with ?page&limit&isRead filter)
// PUT  /api/notifications/read-all     — saari unread ko read mark karo
// DELETE /api/notifications/read       — saari read notifications delete karo
// PUT  /api/notifications/:id/read     — single notification read mark karo
// DELETE /api/notifications/:id        — single notification delete karo

// IMPORTANT: specific routes pehle, param routes baad mein
router.get("/",             notificationController.getAll);
router.put("/read-all",     notificationController.markAllRead);
router.delete("/read",      notificationController.deleteAllRead);
router.put("/:id/read",     notificationController.markRead);
router.delete("/:id",       notificationController.deleteOne);

export default router;