import { Router } from "express";
import dashboardController from "./dashboard.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

// All dashboard routes require login
router.use(authMiddleware);

// GET /api/dashboard/summary            — total counts + enrichment coverage
// GET /api/dashboard/by-industry        — prospects grouped by industry
// GET /api/dashboard/by-country         — prospects grouped by country (top 15)
// GET /api/dashboard/by-priority        — P1/P2/P3/P4 breakdown
// GET /api/dashboard/by-clv             — Tier-A/B/C breakdown
// GET /api/dashboard/top-prospects      — P1 prospects sorted by techFitScore
// GET /api/dashboard/enrichment-activity — last 30 days + ICP stats
// GET /api/dashboard/duplicate-summary  — pending/merged/dismissed counts
// GET /api/dashboard/import-history     — last 10 imports
// GET /api/dashboard/interactions       — by type + by outcome

router.get("/summary",              dashboardController.getSummary);
router.get("/by-industry",          dashboardController.getByIndustry);
router.get("/by-country",           dashboardController.getByCountry);
router.get("/by-priority",          dashboardController.getBySalesPriority);
router.get("/by-clv",               dashboardController.getByCLV);
router.get("/top-prospects",        dashboardController.getTopProspects);
router.get("/enrichment-activity",  dashboardController.getEnrichmentActivity);
router.get("/duplicate-summary",    dashboardController.getDuplicateSummary);
router.get("/import-history",       dashboardController.getImportHistory);
router.get("/interactions",         dashboardController.getInteractionBreakdown);

export default router;