import { Router } from "express";
import authController from "./auth.controller.js";
import { registerValidation, loginValidation } from "./auth.validation.js";

const router = Router();

// POST /api/auth/register
router.post("/register", registerValidation, authController.register);

// POST /api/auth/login
router.post("/login", loginValidation, authController.login);

export default router;