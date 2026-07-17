import { Router } from "express";
import { body } from "express-validator";
import authController from "./auth.controller.js";
import { registerValidation, loginValidation } from "./auth.validation.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

router.post("/register", registerValidation, authController.register);
router.post("/login", loginValidation, authController.login);
router.post("/refresh", authController.refreshToken);
router.post("/logout", authMiddleware, authController.logout);
router.get("/me", authMiddleware, authController.getMe);

router.post(
  "/forgot-password",
  [
    body("email")
      .trim()
      .notEmpty().withMessage("Email is required")
      .isEmail().withMessage("Please enter a valid email"),
  ],
  authController.forgotPassword
);

router.post(
  "/reset-password",
  [
    body("token")
      .notEmpty().withMessage("Reset token is required"),
    body("newPassword")
      .notEmpty().withMessage("New password is required")
      .isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  authController.resetPassword
);

export default router;
