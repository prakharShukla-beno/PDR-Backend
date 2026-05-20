import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import prospectRoutes from "../modules/prospect/prospect.routes.js";
import importRoutes from "../modules/import/import.routes.js";
import contactImportRoutes from "../modules/import/contactImport.routes.js";

import searchRoutes from "../modules/search/search.routes.js";
import campaignRoutes from "../modules/campaign/campaign.routes.js";
import enrichmentRoutes from "../modules/enrichment/enrichment.routes.js";
import notificationRoutes from "../modules/notification/notification.routes.js";
import duplicateRoutes from "../modules/duplicate/duplicate.routes.js";
import interactionRoutes from "../modules/interaction/interaction.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import icpRoutes from "../modules/icp/icp.routes.js";
import auditLogRoutes from "../modules/auditLog/auditLog.routes.js";
import contactRoutes from "../modules/contacts/contact.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/prospects", prospectRoutes);

router.use("/import/contacts", contactImportRoutes);
router.use("/import", importRoutes);

router.use("/search", searchRoutes);
router.use("/campaigns", campaignRoutes);
router.use("/enrichment", enrichmentRoutes);
router.use("/notifications", notificationRoutes);
router.use("/duplicates", duplicateRoutes);
router.use("/interactions", interactionRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/icp", icpRoutes);
router.use("/audit-logs", auditLogRoutes);
router.use("/contacts", contactRoutes);

export default router;