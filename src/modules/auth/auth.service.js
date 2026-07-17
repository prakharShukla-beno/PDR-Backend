import jwt from "jsonwebtoken";
import crypto from "crypto";
import { JWT_SECRET, JWT_REFRESH_SECRET } from "../../config/env.js";
import userRepository from "../user/user.repository.js";
import { sendPasswordResetEmail } from "../../common/utils/emailService.js";
import User from "../user/user.model.js";
import Company from "../company/company.model.js";
import { generateTokens } from "../../common/utils/generateTokens.js";

const authService = {

  register: async ({ companyName, name, email, password }) => {
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      const error = new Error("Email already registered");
      error.statusCode = 409;
      throw error;
    }

    const company = await Company.create({
      name: companyName,
      domain: email.split("@")[1]?.toLowerCase(),
    });

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      companyId: company._id,
      role: "admin",
      isActive: true,
      inviteAccepted: true,
    });

    await Company.findByIdAndUpdate(company._id, { createdBy: user._id });

    const { accessToken, refreshToken } = generateTokens(user);

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
      company: {
        id: company._id,
        name: company.name,
        slug: company.slug,
      },
      accessToken,
      refreshToken,
    };
  },

  login: async ({ email, password }) => {
    const user = await User.findOne({ email: email.toLowerCase() })
      .select("+password")
      .populate("companyId", "name slug isActive plan");

    if (!user || !(await user.comparePassword(password))) {
      const error = new Error("Invalid email or password");
      error.statusCode = 401;
      throw error;
    }

    if (!user.isActive) {
      const error = new Error("Account deactivated. Contact your admin.");
      error.statusCode = 403;
      throw error;
    }

    if (user.companyId && !user.companyId.isActive) {
      const error = new Error("Company account suspended.");
      error.statusCode = 403;
      throw error;
    }

    const isFirstLogin = !user.lastLoginAt;
    await userRepository.updateLastLogin(user._id);

    const { accessToken, refreshToken } = generateTokens(user);

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId?._id,
        company: user.companyId,
        isFirstLogin,
      },
      accessToken,
      refreshToken,
    };
  },

  getMe: async (userId) => {
    const user = await User.findById(userId)
      .select("-password -inviteToken -resetPasswordToken")
      .populate("companyId", "name slug plan settings");

    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    return user;
  },

  refreshToken: async (refreshToken) => {
    if (!refreshToken) {
      const error = new Error("Refresh token required");
      error.statusCode = 400;
      throw error;
    }

    try {
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

      const user = await User.findById(decoded.id).populate("companyId", "name slug");

      if (!user || !user.isActive) {
        const error = new Error("Invalid refresh token");
        error.statusCode = 401;
        throw error;
      }

      return generateTokens(user);
    } catch (error) {
      if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
        const authError = new Error("Invalid or expired refresh token");
        authError.statusCode = 401;
        throw authError;
      }
      throw error;
    }
  },

  forgotPassword: async ({ email }) => {
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return {
        message: "If this email is registered, a reset link has been sent.",
      };
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    try {
      await sendPasswordResetEmail({
        to:       user.email,
        resetURL,
        userName: user.name,
      });
    } catch (emailError) {
      console.error("EMAIL ERROR DETAILS:", emailError);
      user.resetPasswordToken   = null;
      user.resetPasswordExpires = null;
      await user.save({ validateBeforeSave: false });

      const error = new Error("Email could not be sent. Please try again later.");
      error.statusCode = 500;
      throw error;
    }

    return {
      message: "If this email is registered, a reset link has been sent.",
    };
  },

  resetPassword: async ({ token, newPassword }) => {
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken:   hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    }).select("+password");

    if (!user) {
      const error = new Error("Reset link is invalid or has expired. Please request a new one.");
      error.statusCode = 400;
      throw error;
    }

    user.password             = newPassword;
    user.resetPasswordToken   = null;
    user.resetPasswordExpires = null;
    await user.save();

    const { accessToken, refreshToken } = generateTokens(user);

    return {
      message: "Password reset successful.",
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
    };
  },
};

export default authService;
