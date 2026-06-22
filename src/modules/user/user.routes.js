import { Router } from "express";
import userController from "./user.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";
import { adminOnly } from "../../common/middlewares/rbac.middleware.js";

const router = Router();

// Public routes (no auth)
router.post("/accept-invite", userController.acceptInvite);
router.get("/invite/verify",  userController.verifyInviteToken);

// Protected routes (admin only)
router.get("/",           authMiddleware, adminOnly, userController.getCompanyUsers);
router.post("/invite",    authMiddleware, adminOnly, userController.inviteUser);
router.put("/:id/role",   authMiddleware, adminOnly, userController.updateUserRole);
router.delete("/:id",     authMiddleware, adminOnly, userController.removeUser);

export default router;
