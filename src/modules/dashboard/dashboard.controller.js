import dashboardService from "./dashboard.service.js";

const dashboardController = {

  // GET /api/dashboard/summary — saab kuch ek response mein
  getSummary: async (req, res, next) => {
    try {
      const data = await dashboardService.getSummary();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/dashboard/by-industry
  getByIndustry: async (req, res, next) => {
    try {
      const data = await dashboardService.getByIndustry();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/dashboard/by-country
  getByCountry: async (req, res, next) => {
    try {
      const data = await dashboardService.getByCountry();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/dashboard/by-priority
  getBySalesPriority: async (req, res, next) => {
    try {
      const data = await dashboardService.getBySalesPriority();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/dashboard/by-clv
  getByCLV: async (req, res, next) => {
    try {
      const data = await dashboardService.getByCLV();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/dashboard/top-prospects?limit=10
  getTopProspects: async (req, res, next) => {
    try {
      const { limit } = req.query;
      const data = await dashboardService.getTopProspects({ limit });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/dashboard/enrichment-activity
  getEnrichmentActivity: async (req, res, next) => {
    try {
      const data = await dashboardService.getEnrichmentActivity();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/dashboard/duplicate-summary
  getDuplicateSummary: async (req, res, next) => {
    try {
      const data = await dashboardService.getDuplicateSummary();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/dashboard/import-history
  getImportHistory: async (req, res, next) => {
    try {
      const data = await dashboardService.getImportHistory();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/dashboard/interactions
  getInteractionBreakdown: async (req, res, next) => {
    try {
      const data = await dashboardService.getInteractionBreakdown();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};

export default dashboardController;