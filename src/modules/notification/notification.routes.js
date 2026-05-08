import { Router } from "express";
import notificationController from "./notification.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

router.use(authMiddleware);


router.get("/",notificationController.getAll);


router.put("/read-all",      notificationController.markAllAsRead);


router.put("/:id/read",      notificationController.markAsRead);

router.delete("/read",       notificationController.deleteAllRead);


router.delete("/:id",        notificationController.delete);

export default router;