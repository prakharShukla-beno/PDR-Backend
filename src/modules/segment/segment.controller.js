import segmentService from "./segment.service.js";

const segmentController = {

  // POST /api/segments — create and save a new segment
  create: async (req, res, next) => {
    try {
      const segment = await segmentService.create(req.body, req.user._id);
      res.status(201).json({
        success: true,
        message: "Segment created successfully",
        data: segment,
      });
    } catch (error) { next(error); }
  },

  // GET /api/segments — all segments for this user
  getAll: async (req, res, next) => {
    try {
      const segments = await segmentService.getAll(req.user._id);
      res.status(200).json({
        success: true,
        data: { segments, total: segments.length },
      });
    } catch (error) { next(error); }
  },

  // GET /api/segments/:id — single segment detail
  getById: async (req, res, next) => {
    try {
      const segment = await segmentService.getById(req.params.id);
      if (!segment) {
        return res.status(404).json({ success: false, message: "Segment not found" });
      }
      res.status(200).json({ success: true, data: segment });
    } catch (error) { next(error); }
  },

  // PUT /api/segments/:id — update segment filters or name
  update: async (req, res, next) => {
    try {
      const segment = await segmentService.update(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: "Segment updated successfully",
        data: segment,
      });
    } catch (error) { next(error); }
  },

  // DELETE /api/segments/:id — delete segment permanently
  delete: async (req, res, next) => {
    try {
      await segmentService.delete(req.params.id);
      res.status(200).json({ success: true, message: "Segment deleted successfully" });
    } catch (error) { next(error); }
  },

  // GET /api/segments/:id/prospects — paginated prospects matching this segment
  getProspects: async (req, res, next) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const result = await segmentService.getMatchingProspects(
        req.params.id, +page, +limit
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  },

  // POST /api/segments/preview — live preview without saving
  // Returns count + top 5 accounts for real-time filter preview
  preview: async (req, res, next) => {
    try {
      const result = await segmentService.preview(req.body.filters || {});
      res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  },
};

export default segmentController;