import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import prospectRoutes from "../modules/prospect/prospect.routes.js";
import importRoutes from "../modules/import/import.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/prospects", prospectRoutes);
router.use("/import", importRoutes);

export default router;