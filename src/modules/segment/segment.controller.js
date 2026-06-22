import segmentService from "./segment.service.js";
import { getCompanyIdFromRequest } from "../../common/utils/tenantScope.js";

const segmentController = {

  create: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const segment = await segmentService.create(req.body, req.user._id, companyId);
      res.status(201).json({
        success: true,
        message: "Segment created successfully",
        data:    segment,
      });
    } catch (error) { next(error); }
  },

  getAll: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const segments = await segmentService.getAll(req.user._id, companyId);
      res.status(200).json({
        success: true,
        data: { segments, total: segments.length },
      });
    } catch (error) { next(error); }
  },

  getById: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const segment = await segmentService.getById(req.params.id, companyId);
      if (!segment) {
        return res.status(404).json({ success: false, message: "Segment not found" });
      }
      res.status(200).json({ success: true, data: segment });
    } catch (error) { next(error); }
  },

  update: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const segment = await segmentService.update(req.params.id, req.body, companyId);
      res.status(200).json({
        success: true,
        message: "Segment updated successfully",
        data:    segment,
      });
    } catch (error) { next(error); }
  },

  delete: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      await segmentService.delete(req.params.id, companyId);
      res.status(200).json({ success: true, message: "Segment deleted successfully" });
    } catch (error) { next(error); }
  },

  getAccounts: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const { page = 1, limit = 10 } = req.query;
      const result = await segmentService.getStoredAccounts(
        req.params.id, Number(page), Number(limit), companyId
      );
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  },

  sync: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const segment = await segmentService.sync(req.params.id, companyId);
      res.status(200).json({
        success: true,
        message: `Synced — ${segment.matchCount} accounts found`,
        data:    segment,
      });
    } catch (error) { next(error); }
  },

  preview: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const result = await segmentService.preview(req.body.filters || {}, companyId);
      res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  },

  // POST /api/segments/:id/add-accounts
  // Selected account IDs ko existing segment snapshot mein add karo (no duplicates)
  addAccounts: async (req, res, next) => {
    try {
      const { accountIds } = req.body;
      if (!Array.isArray(accountIds) || accountIds.length === 0) {
        return res.status(400).json({ success: false, message: "accountIds array required" });
      }
      const segment = await segmentService.addAccounts(req.params.id, accountIds);
      res.status(200).json({
        success: true,
        message: `${accountIds.length} account(s) added to segment`,
        data: { matchCount: segment.matchCount },
      });
    } catch (error) { next(error); }
  },

  // POST /api/segments/:id/enrich-score
  // Segment ke matched accounts pe enrichment + tech fit scoring chalaao
  // Background mein run hota hai — turant 202 return karta hai
  enrichAndScore: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const result = await segmentService.enrichAndScore(
        req.params.id,
        req.user._id,
        companyId
      );
      res.status(202).json({
        success: true,
        message: result.message,
        data:    result,
      });
    } catch (error) {
      if (error.message === "Enrichment already running for this segment") {
        return res.status(409).json({
          success: false,
          message: error.message,
        });
      }
      next(error);
    }
  },
};

export default segmentController;
