import dashboardService from "./dashboard.service.js";
import { getCompanyIdFromRequest } from "../../common/utils/tenantScope.js";

const dashboardController = {

  getSummary: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const data = await dashboardService.getSummary(companyId);
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  getByIndustry: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const data = await dashboardService.getByIndustry(companyId);
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  getByCountry: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const data = await dashboardService.getByCountry(companyId);
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  getBySalesPriority: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const data = await dashboardService.getBySalesPriority(companyId);
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  getByCLV: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const data = await dashboardService.getByCLV(companyId);
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  getTopProspects: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const { limit } = req.query;
      const data = await dashboardService.getTopProspects(companyId, { limit });
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  getEnrichmentActivity: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const data = await dashboardService.getEnrichmentActivity(companyId);
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  getDuplicateSummary: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const data = await dashboardService.getDuplicateSummary(companyId);
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  getImportHistory: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const data = await dashboardService.getImportHistory(companyId);
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  getInteractionBreakdown: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const data = await dashboardService.getInteractionBreakdown(companyId);
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  getAiInsight: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const data = await dashboardService.getAiInsight(companyId);
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },

  getTopMovers: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const { limit = 5 } = req.query;
      const data = await dashboardService.getTopMovers(companyId, { limit });
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  },
};

export default dashboardController;
