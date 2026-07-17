import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_REFRESH_SECRET } from "../../config/env.js";

export const generateTokens = (user) => {
  const companyId = user.companyId?._id || user.companyId;

  const payload = {
    id: user._id,
    email: user.email,
    role: user.role,
    companyId,
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });

  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "7d" });

  return { accessToken, refreshToken };
};
