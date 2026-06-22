import { validationResult } from "express-validator";
import authService from "./auth.service.js";

const authController = {

  register: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }

      const { companyName, name, email, password } = req.body;

      if (!companyName || !name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: "companyName, name, email, password required",
        });
      }

      const result = await authService.register({ companyName, name, email, password });

      res.status(201).json({
        success: true,
        message: "Company and admin account created successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  login: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }

      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: "Email and password required",
        });
      }

      const result = await authService.login({ email, password });

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  getMe: async (req, res, next) => {
    try {
      const user = await authService.getMe(req.user.id);

      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  refreshToken: async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      const tokens = await authService.refreshToken(refreshToken);

      res.status(200).json({
        success: true,
        data: tokens,
      });
    } catch (error) {
      next(error);
    }
  },

  logout: async (req, res) => {
    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  },

  forgotPassword: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }
      const { email } = req.body;
      const result = await authService.forgotPassword({ email });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  resetPassword: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }
      const { token, newPassword } = req.body;
      const result = await authService.resetPassword({ token, newPassword });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};

export default authController;
