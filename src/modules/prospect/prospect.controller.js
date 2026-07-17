import { validationResult } from "express-validator";
import prospectService from "./prospect.service.js";
import Prospect from "./prospect.model.js";
import { getCompanyIdFromRequest, companyObjectId } from "../../common/utils/tenantScope.js";
import { scoreAllProspectsForCompany } from "../../common/services/icpScoreService.js";

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

      const companyId = getCompanyIdFromRequest(req);
      const { prospect, isDuplicate } = await prospectService.create(req.body, req.user._id, companyId);

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
      const companyId = getCompanyIdFromRequest(req);
      const result = await prospectService.getAll(companyId, req.query);
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
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
      const companyId = getCompanyIdFromRequest(req);
      const prospect = await prospectService.getById(req.params.id, companyId);
      res.status(200).json({ success: true, data: prospect });
    } catch (error) { next(error); }
  },

  // PUT /api/prospects/:id — update prospect fields
  update: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const updated = await prospectService.update(req.params.id, req.body, companyId);
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
      const companyId = getCompanyIdFromRequest(req);
      const result = await prospectService.delete(req.params.id, companyId);
      res.status(200).json({ success: true, message: result.message });
    } catch (error) { next(error); }
  },

  // GET /api/prospects/export — download all prospects as Excel file
  export: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const { buffer, filename } = await prospectService.exportToExcel(companyId, req.query);
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
      const companyId = getCompanyIdFromRequest(req);
      const result = await prospectService.calculateAndSaveScore(req.params.id, companyId);

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
      const companyId = getCompanyIdFromRequest(req);
      const result = await prospectService.getScoreBreakdown(req.params.id, companyId);
      res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  },

  // ── NEW: PUT /api/prospects/:id/override-tier ─────────────────────────────────
  // Lets a salesperson manually override the tier/priority
  // Body: { clvRanking, salesPriority, overrideReason }
  overrideTier: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const updated = await prospectService.overrideTier(req.params.id, req.body, companyId);
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
      const companyId = getCompanyIdFromRequest(req);

      const clvResult = await prospectService.bulkReTier(companyId);
      const icpResult = await scoreAllProspectsForCompany(companyId);
      await prospectService.syncSalesPriorityFromIcp(companyId);

      res.status(200).json({
        success: true,
        message: "Re-tier and ICP scoring complete",
        data: {
          clv: clvResult,
          icp: icpResult,
        },
      });
    } catch (error) { next(error); }
  },

  // GET /api/prospects/icp-stats — ICP tier/priority distribution
  getIcpStats: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const cId = companyObjectId(companyId);

      const [
        tierCounts,
        priorityCounts,
        staleCount,
        unscoredCount,
      ] = await Promise.all([
        Prospect.aggregate([
          { $match: { companyId: cId } },
          { $group: { _id: "$icpTier", count: { $sum: 1 } } },
        ]),
        Prospect.aggregate([
          {
            $match: {
              companyId: cId,
              icpSalesPriority: { $ne: null },
            },
          },
          { $group: { _id: "$icpSalesPriority", count: { $sum: 1 } } },
        ]),
        Prospect.countDocuments({ companyId: cId, icpScoreStale: true }),
        Prospect.countDocuments({ companyId: cId, icpMatchScore: null }),
      ]);

      const tiers = { "Tier A": 0, "Tier B": 0, "Tier C": 0 };
      tierCounts.forEach((t) => {
        if (t._id) tiers[t._id] = t.count;
      });

      const priorities = { P1: 0, P2: 0, P3: 0, P4: 0 };
      priorityCounts.forEach((p) => {
        if (p._id) priorities[p._id] = p.count;
      });

      res.status(200).json({
        success: true,
        data: {
          tiers,
          priorities,
          staleCount,
          unscoredCount,
          totalScored:
            tiers["Tier A"] + tiers["Tier B"] + tiers["Tier C"],
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // ── POST /api/prospects/:id/suggest-poc ──────────────────────────────────
  // Calls Gemini to suggest best POC for this account
  // Returns recommended contact (if exists) or target role (if no contacts)
  suggestPoc: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const result = await prospectService.suggestPoc(req.params.id, companyId);
      res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  },

};

export default prospectController;
