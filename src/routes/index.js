import { Router } from "express";
import authRoutes          from "../modules/auth/auth.routes.js";
import prospectRoutes      from "../modules/prospect/prospect.routes.js";
import importRoutes        from "../modules/import/import.routes.js";
import searchRoutes        from "../modules/search/search.routes.js";
import campaignRoutes      from "../modules/campaign/campaign.routes.js";
import enrichmentRoutes    from "../modules/enrichment/enrichment.routes.js";
import notificationRoutes  from "../modules/notification/notification.routes.js";
import duplicateRoutes     from "../modules/duplicate/duplicate.routes.js";

const router = Router();

router.use("/auth",           authRoutes);
router.use("/prospects",      prospectRoutes);
router.use("/import",         importRoutes);
router.use("/search",         searchRoutes);
router.use("/campaigns",      campaignRoutes);
router.use("/enrichment",     enrichmentRoutes);
router.use("/notifications",  notificationRoutes);
router.use("/duplicates",     duplicateRoutes);

export default router;