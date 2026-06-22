import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/env.js";

const attachUserFromToken = (decoded) => ({
  _id: decoded.id,
  id: decoded.id,
  email: decoded.email,
  role: decoded.role,
  companyId: decoded.companyId,
});

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = attachUserFromToken(decoded);
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
        code: "TOKEN_EXPIRED",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = attachUserFromToken(decoded);
    }
  } catch {
    // optional — ignore invalid tokens
  }
  next();
};

export const authenticate = authMiddleware;
export default authMiddleware;
