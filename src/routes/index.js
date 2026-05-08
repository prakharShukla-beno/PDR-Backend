import { Router } from "express";
import authRoutes         from "../modules/auth/auth.routes.js";
import prospectRoutes     from "../modules/prospect/prospect.routes.js";
import importRoutes       from "../modules/import/import.routes.js";
import searchRoutes       from "../modules/search/search.routes.js";
import campaignRoutes     from "../modules/campaign/campaign.routes.js";
import notificationRoutes from "../modules/notification/notification.routes.js";

const router = Router();

router.use("/auth",          authRoutes);
router.use("/prospects",     prospectRoutes);
router.use("/import",        importRoutes);
router.use("/search",        searchRoutes);
router.use("/campaigns",     campaignRoutes);
router.use("/notifications", notificationRoutes);

export default router;