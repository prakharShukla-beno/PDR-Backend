import { Router } from "express";
import { body } from "express-validator";
import authController from "./auth.controller.js";
import { registerValidation, loginValidation } from "./auth.validation.js";

const router = Router();

// POST /api/auth/register
router.post("/register", registerValidation, authController.register);

// POST /api/auth/login
router.post("/login", loginValidation, authController.login);

// POST /api/auth/forgot-password
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

// POST /api/auth/reset-password
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