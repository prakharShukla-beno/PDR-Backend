import segmentService from "./segment.service.js";

const segmentController = {

  // POST /api/segments
  create: async (req, res, next) => {
    try {
      const segment = await segmentService.create(req.body, req.user._id);
      res.status(201).json({
        success: true,
        message: "Segment created successfully",
        data:    segment,
      });
    } catch (error) { next(error); }
  },

  // GET /api/segments
  getAll: async (req, res, next) => {
    try {
      const segments = await segmentService.getAll(req.user._id);
      res.status(200).json({
        success: true,
        data: { segments, total: segments.length },
      });
    } catch (error) { next(error); }
  },

  // GET /api/segments/:id
  getById: async (req, res, next) => {
    try {
      const segment = await segmentService.getById(req.params.id);
      if (!segment) {
        return res.status(404).json({ success: false, message: "Segment not found" });
      }
      res.status(200).json({ success: true, data: segment });
    } catch (error) { next(error); }
  },

  // PUT /api/segments/:id
  update: async (req, res, next) => {
    try {
      const segment = await segmentService.update(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: "Segment updated successfully",
        data:    segment,
      });
    } catch (error) { next(error); }
  },

  // DELETE /api/segments/:id
  delete: async (req, res, next) => {
    try {
      await segmentService.delete(req.params.id);
      res.status(200).json({ success: true, message: "Segment deleted successfully" });
    } catch (error) { next(error); }
  },

  // GET /api/segments/:id/accounts — paginated stored accounts + tier breakdown
  getAccounts: async (req, res, next) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const result = await segmentService.getStoredAccounts(
        req.params.id, Number(page), Number(limit)
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  },

  // POST /api/segments/:id/sync — fresh query, update snapshot
  sync: async (req, res, next) => {
    try {
      const segment = await segmentService.sync(req.params.id);
      res.status(200).json({
        success: true,
        message: `Synced — ${segment.matchCount} accounts found`,
        data:    segment,
      });
    } catch (error) { next(error); }
  },

  // POST /api/segments/preview — live preview without saving
  preview: async (req, res, next) => {
    try {
      const result = await segmentService.preview(req.body.filters || {});
      res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  },

  // POST /api/segments/:id/enrich-score
  // Segment ke matched accounts pe enrichment + tech fit scoring chalaao
  // Background mein run hota hai — turant 202 return karta hai
  enrichAndScore: async (req, res, next) => {
    try {
      const result = await segmentService.enrichAndScore(
        req.params.id,
        req.user._id
      );
      res.status(202).json({
        success: true,
        message: result.message,
        data:    result,
      });
    } catch (error) {
      // Already running check
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