import jwt from "jsonwebtoken";
import crypto from "crypto";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/env.js";
import userRepository from "../user/user.repository.js";
import { sendPasswordResetEmail } from "../../common/utils/email.js";
import User from "../user/user.model.js";

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const authService = {

  // ── Register ─────────────────────────────────────────────────────────────────
  register: async ({ name, email, password }) => {
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      const error = new Error("Email already registered");
      error.statusCode = 409;
      throw error;
    }
    const user = await userRepository.create({ name, email, password });
    const token = generateToken(user._id);
    return {
      token,
      user: { id: user._id, name: user.name, email: user.email },
    };
  },

  // ── Login ─────────────────────────────────────────────────────────────────────
  login: async ({ email, password }) => {
    const user = await userRepository.findByEmail(email, true);
    if (!user || !(await user.comparePassword(password))) {
      const error = new Error("Invalid email or password");
      error.statusCode = 401;
      throw error;
    }
    await userRepository.updateLastLogin(user._id);
    const token = generateToken(user._id);
    return {
      token,
      user: { id: user._id, name: user.name, email: user.email },
    };
  },

  // ── Forgot Password ───────────────────────────────────────────────────────────
  // Step 1 — send an email with a password reset link
  forgotPassword: async ({ email }) => {

    const user = await User.findOne({ email: email.toLowerCase() });

    // Security: always return the same message whether or not the user exists
    // This prevents disclosure of which emails are registered
    if (!user) {
      return {
        message: "If this email is registered, a reset link has been sent.",
      };
    }

    // Generate a reset token and save it to the database
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // Frontend reset page URL
    const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    try {
      await sendPasswordResetEmail({
        to:       user.email,
        resetURL,
        userName: user.name,
      });
    } catch (emailError) {

      console.error("EMAIL ERROR DETAILS:", emailError);

      // Email failed — clear token fields
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

  // ── Reset Password ────────────────────────────────────────────────────────────
  // Step 2 — verify the token and set the new password
  resetPassword: async ({ token, newPassword }) => {

    // Hash the raw token from the URL and match it against the database
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find a user where the token matches and has not expired
    const user = await User.findOne({
      resetPasswordToken:   hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    }).select("+password");

    if (!user) {
      const error = new Error("Reset link is invalid or has expired. Please request a new one.");
      error.statusCode = 400;
      throw error;
    }

    // Set the new password
    user.password             = newPassword;
    user.resetPasswordToken   = null; // one-time use — clear token
    user.resetPasswordExpires = null;
    await user.save();

    // Auto login — return a new JWT
    const jwtToken = generateToken(user._id);

    return {
      message: "Password reset successful.",
      token:   jwtToken,
      user: { id: user._id, name: user.name, email: user.email },
    };
  },
};

export default authService;