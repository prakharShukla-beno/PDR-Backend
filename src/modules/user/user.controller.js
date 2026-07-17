import crypto from "crypto";
import bcrypt from "bcryptjs";
import User from "./user.model.js";
import Company from "../company/company.model.js";
import { generateTokens } from "../../common/utils/generateTokens.js";
import {
  sendInviteEmail,
  sendWelcomeEmail,
} from "../../common/utils/emailService.js";

const userController = {

  getCompanyUsers: async (req, res, next) => {
    try {
      const users = await User.find({ companyId: req.user.companyId })
        .select("-password -inviteToken -resetPasswordToken")
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        data: users,
        total: users.length,
      });
    } catch (error) {
      next(error);
    }
  },

  updateUserRole: async (req, res, next) => {
    try {
      const { role } = req.body;

      if (!["admin", "editor", "viewer"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role. Must be admin, editor, or viewer",
        });
      }

      if (req.params.id === req.user.id || req.params.id === req.user._id?.toString()) {
        return res.status(400).json({
          success: false,
          message: "Cannot change your own role",
        });
      }

      const user = await User.findOneAndUpdate(
        { _id: req.params.id, companyId: req.user.companyId },
        { role },
        { new: true }
      ).select("-password");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.status(200).json({
        success: true,
        message: `Role updated to ${role}`,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  removeUser: async (req, res, next) => {
    try {
      if (req.params.id === req.user.id || req.params.id === req.user._id?.toString()) {
        return res.status(400).json({
          success: false,
          message: "Cannot remove yourself",
        });
      }

      const user = await User.findOneAndUpdate(
        { _id: req.params.id, companyId: req.user.companyId },
        { isActive: false },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.status(200).json({
        success: true,
        message: `${user.name} has been removed from the team`,
        data: { id: user._id, isActive: user.isActive },
      });
    } catch (error) {
      next(error);
    }
  },

  inviteUser: async (req, res, next) => {
    try {
      const { email, role = "editor", name } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }

      if (!["admin", "editor", "viewer"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role",
        });
      }

      const normalizedEmail = email.toLowerCase().trim();

      const existingUser = await User.findOne({
        email: normalizedEmail,
        companyId: req.user.companyId,
      });

      if (existingUser) {
        const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");

        const sendInviteForExisting = async (inviteLink, expiry, flags) => {
          const [inviter, company] = await Promise.all([
            User.findById(req.user.id).select("name email"),
            Company.findById(req.user.companyId).select("name"),
          ]);

          let emailResult = { sent: false };
          try {
            emailResult = await sendInviteEmail({
              toEmail: existingUser.email,
              toName: existingUser.name,
              inviterName: inviter.name,
              inviterEmail: inviter.email,
              companyName: company.name,
              role: role || existingUser.role,
              inviteLink,
            });
          } catch (err) {
            console.error("Invite email failed:", err.message);
          }

          return res.status(200).json({
            success: true,
            message: emailResult.sent
              ? `Invite resent to ${normalizedEmail}`
              : `Invite created — email delivery failed, share link manually`,
            data: {
              invitedUser: {
                id: existingUser._id,
                name: existingUser.name,
                email: existingUser.email,
                role: role || existingUser.role,
              },
              inviteLink,
              emailSent: emailResult.sent,
              emailError: emailResult.sent ? null : emailResult.reason,
              expiresAt: expiry,
              ...flags,
            },
          });
        };

        // Case 1 — Removed user → reactivate (must check before inviteAccepted)
        if (!existingUser.isActive && existingUser.inviteAccepted) {
          const newInviteToken = crypto.randomBytes(32).toString("hex");
          const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

          await User.findByIdAndUpdate(existingUser._id, {
            inviteToken: newInviteToken,
            inviteTokenExpiry: newExpiry,
            inviteAccepted: false,
            isActive: false,
            role: role || existingUser.role,
            invitedBy: req.user.id,
          });

          const inviteLink = `${frontendUrl}/accept-invite?token=${newInviteToken}`;
          return sendInviteForExisting(inviteLink, newExpiry, { reactivated: true });
        }

        // Case 2 — Active member → blocked
        if (existingUser.isActive && existingUser.inviteAccepted) {
          return res.status(409).json({
            success: false,
            message: "User is already an active member of this company",
          });
        }

        // Case 3 — Pending (invited but not yet accepted) → resend
        const newInviteToken = crypto.randomBytes(32).toString("hex");
        const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await User.findByIdAndUpdate(existingUser._id, {
          inviteToken: newInviteToken,
          inviteTokenExpiry: newExpiry,
          role: role || existingUser.role,
          invitedBy: req.user.id,
        });

        const inviteLink = `${frontendUrl}/accept-invite?token=${newInviteToken}`;
        return sendInviteForExisting(inviteLink, newExpiry, { resent: true });
      }

      const emailTaken = await User.findOne({ email: normalizedEmail });

      if (emailTaken) {
        return res.status(409).json({
          success: false,
          message: "Email already registered in another company",
        });
      }

      const inviteToken = crypto.randomBytes(32).toString("hex");
      const inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invitedUser = await User.create({
        name: name || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        password: crypto.randomBytes(32).toString("hex"),
        companyId: req.user.companyId,
        role,
        isActive: false,
        inviteAccepted: false,
        inviteToken,
        inviteTokenExpiry,
        invitedBy: req.user.id,
      });

      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
      const inviteLink = `${frontendUrl}/accept-invite?token=${inviteToken}`;

      const [inviter, company] = await Promise.all([
        User.findById(req.user.id).select("name email"),
        Company.findById(req.user.companyId).select("name"),
      ]);

      let emailResult = { sent: false };
      try {
        emailResult = await sendInviteEmail({
          toEmail: invitedUser.email,
          toName: invitedUser.name,
          inviterName: inviter.name,
          inviterEmail: inviter.email,
          companyName: company.name,
          role: invitedUser.role,
          inviteLink,
        });
      } catch (err) {
        console.error("Email send threw an error:", err.message);
      }

      res.status(201).json({
        success: true,
        message: emailResult.sent
          ? `Invitation email sent to ${normalizedEmail}`
          : `Invite created — email delivery failed or not configured, share the link manually`,
        data: {
          invitedUser: {
            id: invitedUser._id,
            name: invitedUser.name,
            email: invitedUser.email,
            role: invitedUser.role,
          },
          inviteLink,
          emailSent: emailResult.sent,
          emailError: emailResult.sent ? null : emailResult.reason,
          expiresAt: inviteTokenExpiry,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  acceptInvite: async (req, res, next) => {
    try {
      const { token, password, name } = req.body;

      if (!token || !password) {
        return res.status(400).json({
          success: false,
          message: "Token and password are required",
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters",
        });
      }

      const user = await User.findOne({
        inviteToken: token,
        inviteTokenExpiry: { $gt: new Date() },
        inviteAccepted: false,
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired invite token",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      await User.findByIdAndUpdate(user._id, {
        password: hashedPassword,
        name: name || user.name,
        isActive: true,
        inviteAccepted: true,
        inviteToken: null,
        inviteTokenExpiry: null,
        lastLoginAt: new Date(),
      });

      const verifyUpdate = await User.findById(user._id);
      console.log("After accept:", {
        email: verifyUpdate.email,
        isActive: verifyUpdate.isActive,
        inviteAccepted: verifyUpdate.inviteAccepted,
      });

      const updatedUser = await User.findById(user._id).populate("companyId", "name slug");
      const { accessToken, refreshToken } = generateTokens(updatedUser);

      sendWelcomeEmail({
        toEmail: updatedUser.email,
        toName: updatedUser.name,
        companyName: updatedUser.companyId.name,
      }).catch((err) =>
        console.error("Welcome email failed silently:", err.message)
      );

      res.status(200).json({
        success: true,
        message: "Invite accepted successfully. You are now logged in.",
        data: {
          user: {
            id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            company: updatedUser.companyId,
          },
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  verifyInviteToken: async (req, res, next) => {
    try {
      const { token } = req.query;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: "Token is required",
        });
      }

      const user = await User.findOne({
        inviteToken: token,
        inviteTokenExpiry: { $gt: new Date() },
        inviteAccepted: false,
      })
        .populate("companyId", "name slug")
        .populate("invitedBy", "name email");

      if (!user) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired invite token",
        });
      }

      res.status(200).json({
        success: true,
        data: {
          email: user.email,
          name: user.name,
          role: user.role,
          company: user.companyId,
          invitedBy: user.invitedBy,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

export default userController;
