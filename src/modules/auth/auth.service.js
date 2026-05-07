import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/env.js";
import userRepository from "../user/user.repository.js";

const generateToken = (userId) => {
  return jwt.sign(
    { id: userId }, 
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

const authService = {
  // ─── Register ──────────
  register: async ({ name, email, password }) => {
   
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      const error = new Error("Email already registered");
      error.statusCode = 409; // Conflict
      throw error;
    }

    const user = await userRepository.create({ name, email, password });

    const token = generateToken(user._id);

    return {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    };
  },

  // ─── Login ───────────────────────────────────────────────────────────────────
  login: async ({ email, password }) => {
  
    const user = await userRepository.findByEmail(email, true);

    if (!user || !(await user.comparePassword(password))) {
      const error = new Error("Invalid email or password");
      error.statusCode = 401; // Unauthorized
      throw error;
    }

    await userRepository.updateLastLogin(user._id);

  
    const token = generateToken(user._id);

    return {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    };
  },
};

export default authService;