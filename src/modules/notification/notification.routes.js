import { Router } from "express";
import notificationController from "./notification.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

router.use(authMiddleware);



router.get("/",notificationController.getAll);



router.delete("/read",       notificationController.deleteAllRead);

router.put("/read-all",  notificationController.markAllRead);
router.put("/:id/read",  notificationController.markRead);
router.delete("/:id",    notificationController.deleteOne);

export default router;