import { Router } from "express";
import dashboardController from "./dashboard.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();
router.use(authMiddleware);

// Existing routes
router.get("/summary",             dashboardController.getSummary);
router.get("/by-industry",         dashboardController.getByIndustry);
router.get("/by-country",          dashboardController.getByCountry);
router.get("/by-priority",         dashboardController.getBySalesPriority);
router.get("/by-clv",              dashboardController.getByCLV);
router.get("/top-prospects",       dashboardController.getTopProspects);
router.get("/enrichment-activity", dashboardController.getEnrichmentActivity);
router.get("/duplicate-summary",   dashboardController.getDuplicateSummary);
router.get("/import-history",      dashboardController.getImportHistory);
router.get("/interactions",        dashboardController.getInteractionBreakdown);

// New routes — FR-6.1 actionable insights
router.get("/ai-insight",          dashboardController.getAiInsight);
router.get("/top-movers",          dashboardController.getTopMovers);

export default router;