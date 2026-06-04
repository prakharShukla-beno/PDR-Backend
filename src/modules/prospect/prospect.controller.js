import { validationResult } from "express-validator";
import prospectService from "./prospect.service.js";

const prospectController = {

  // POST /api/prospects — create with duplicate check
  create: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
      }

      const { prospect, isDuplicate } = await prospectService.create(req.body, req.user._id);

      res.status(201).json({
        success: true,
        message: isDuplicate
          ? "Prospect created — duplicate detected, flagged for review"
          : "Prospect created successfully",
        data: prospect,
        isDuplicate,
      });
    } catch (error) { next(error); }
  },

  // GET /api/prospects — paginated list with filters
  getAll: async (req, res, next) => {
    try {
      const result = await prospectService.getAll(req.query);
      res.status(200).json({
        success:    true,
        data:       result.prospects,
        pagination: result.pagination,
      });
    } catch (error) { next(error); }
  },

  // GET /api/prospects/:id — single prospect with all relations
  getById: async (req, res, next) => {
    try {
      const prospect = await prospectService.getById(req.params.id);
      res.status(200).json({ success: true, data: prospect });
    } catch (error) { next(error); }
  },

  // PUT /api/prospects/:id — update prospect fields
  update: async (req, res, next) => {
    try {
      const updated = await prospectService.update(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: "Prospect updated successfully",
        data:    updated,
      });
    } catch (error) { next(error); }
  },

  // DELETE /api/prospects/:id — delete prospect
  delete: async (req, res, next) => {
    try {
      const result = await prospectService.delete(req.params.id);
      res.status(200).json({ success: true, message: result.message });
    } catch (error) { next(error); }
  },

  // GET /api/prospects/export — download all prospects as Excel file
  export: async (req, res, next) => {
    try {
      const { buffer, filename } = await prospectService.exportToExcel(req.query);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) { next(error); }
  },

  // ── NEW: POST /api/prospects/calculate-score/:id ─────────────────────────────
  // Runs the scoring formula on one prospect and saves results to DB
  //
  // When to call this from frontend:
  //   - User clicks "Calculate Score" button on account detail page
  //   - After user manually fills financialCapacity / strategicValue / marginPotential
  //   - After AI enrichment (enrichment.service.js calls this automatically)
  calculateScore: async (req, res, next) => {
    try {
      const result = await prospectService.calculateAndSaveScore(req.params.id);

      res.status(200).json({
        success: true,
        message: result.disqualified
          ? "Account disqualified — no tech fit match"
          : `Score calculated: ${result.finalScore} → ${result.clvRanking}`,
        data: {
          finalScore:    result.finalScore,
          techFitScore:  result.techFitScore,
          clvRanking:    result.clvRanking,
          salesPriority: result.salesPriority,
          disqualified:  result.disqualified,
          breakdown:     result.breakdown,
        },
      });
    } catch (error) { next(error); }
  },

  // ── NEW: GET /api/prospects/:id/score-breakdown ───────────────────────────────
  // Returns step-by-step explanation of how score was calculated
  // Used by frontend scoring tab — does NOT save anything to DB
  //
  // Example response:
  //   breakdown.formula = "((25 + 20) × 1.2) × 1.0 = 54"
  //   breakdown.techFit = { multiplier: 1.0, label: "Core Match" }
  //   breakdown.financial = { points: 25, label: "Mid-Market" }
  getScoreBreakdown: async (req, res, next) => {
    try {
      const result = await prospectService.getScoreBreakdown(req.params.id);
      res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  },

  // ── NEW: PUT /api/prospects/:id/override-tier ─────────────────────────────────
  // Lets a salesperson manually override the tier/priority
  // Body: { clvRanking, salesPriority, overrideReason }
  overrideTier: async (req, res, next) => {
    try {
      const updated = await prospectService.overrideTier(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: "Tier manually overridden",
        data:    updated,
      });
    } catch (error) { next(error); }
  },

  // ── NEW: POST /api/prospects/re-tier ─────────────────────────────────────────
  // Runs scoring formula on ALL prospects in DB and saves results
  // Used when formula changes or "Re-Tier All" button clicked
  // Warning: slow on large datasets — runs one by one
  bulkReTier: async (req, res, next) => {
    try {
      const results = await prospectService.bulkReTier();
      res.status(200).json({
        success: true,
        message: `Re-tier complete — ${results.success} updated, ${results.failed} failed`,
        data:    results,
      });
    } catch (error) { next(error); }
  },
};

export default prospectController;
