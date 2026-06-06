import dashboardService from "./dashboard.service.js";

const dashboardController = {

  // GET /api/dashboard/summary — total counts for KPI cards
  getSummary: async (req, res, next) => {
    try {
      const data = await dashboardService.getSummary();
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  // GET /api/dashboard/by-industry — prospects grouped by industry
  getByIndustry: async (req, res, next) => {
    try {
      const data = await dashboardService.getByIndustry();
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  // GET /api/dashboard/by-country — prospects grouped by country
  getByCountry: async (req, res, next) => {
    try {
      const data = await dashboardService.getByCountry();
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  // GET /api/dashboard/by-priority — P1/P2/P3/P4 breakdown
  getBySalesPriority: async (req, res, next) => {
    try {
      const data = await dashboardService.getBySalesPriority();
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  // GET /api/dashboard/by-clv — Tier-A/B/C breakdown
  getByCLV: async (req, res, next) => {
    try {
      const data = await dashboardService.getByCLV();
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  // GET /api/dashboard/top-prospects?limit=10 — highest scored P1 accounts
  getTopProspects: async (req, res, next) => {
    try {
      const { limit } = req.query;
      const data = await dashboardService.getTopProspects({ limit });
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  // GET /api/dashboard/enrichment-activity — last 30 days enrichment stats
  getEnrichmentActivity: async (req, res, next) => {
    try {
      const data = await dashboardService.getEnrichmentActivity();
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  // GET /api/dashboard/duplicate-summary — pending/merged/dismissed counts
  getDuplicateSummary: async (req, res, next) => {
    try {
      const data = await dashboardService.getDuplicateSummary();
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  // GET /api/dashboard/import-history — last 10 import logs
  getImportHistory: async (req, res, next) => {
    try {
      const data = await dashboardService.getImportHistory();
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  // GET /api/dashboard/interactions — interaction breakdown by type and outcome
  getInteractionBreakdown: async (req, res, next) => {
    try {
      const data = await dashboardService.getInteractionBreakdown();
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  // GET /api/dashboard/ai-insight — AI insight of the day card (FR-6.1)
  getAiInsight: async (req, res, next) => {
    try {
      const data = await dashboardService.getAiInsight();
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  // GET /api/dashboard/top-movers?limit=5 — accounts with highest scores this week
  getTopMovers: async (req, res, next) => {
    try {
      const { limit = 5 } = req.query;
      const data = await dashboardService.getTopMovers({ limit });
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },
};

export default dashboardController;