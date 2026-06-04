import prospectRepository from "./prospect.repository.js";
import duplicateRepository from "../duplicate/duplicate.repository.js";
import { calculateScore }   from "../../common/utils/scoring.js";
import pkg from "xlsx";
const { utils, write } = pkg;

const prospectService = {

  // Create prospect with automatic duplicate detection
  create: async (data, userId) => {
    const existing = await prospectRepository.findDuplicates({
      accountName: data.accountName,
      website:     data.website,
    });

    const isDuplicate = existing.length > 0;

    const prospect = await prospectRepository.create({
      ...data,
      isDuplicate,
      source: data.source || "excel",
    });

    // Log duplicate pair for review
    if (isDuplicate) {
      const matchFields = [];
      if (data.accountName) matchFields.push("accountName");
      if (data.website)     matchFields.push("website");

      await duplicateRepository.create({
        prospectId1: existing[0]._id,
        prospectId2: prospect._id,
        matchFields,
        status: "pending",
      });
    }

    return { prospect, isDuplicate };
  },

  // Get paginated prospects with filters and sorting
  getAll: async (query) => {
    const {
      page = 1, limit = 10, search,
      primaryIndustry, country, salesPriority,
      isDuplicate, clvRanking, businessModel,
      sortBy = "createdAt", sortOrder = "desc",
    } = query;

    const filter = {};

    if (search) {
      filter.$or = [
        { accountName:       { $regex: search, $options: "i" } },
        { website:           { $regex: search, $options: "i" } },
        { country:           { $regex: search, $options: "i" } },
        { "contacts.email":  { $regex: search, $options: "i" } },
        { "contacts.name":   { $regex: search, $options: "i" } },
      ];
    }

    if (primaryIndustry) filter.primaryIndustry = primaryIndustry;
    if (country)         filter.country         = { $regex: country, $options: "i" };
    if (salesPriority)   filter.salesPriority   = salesPriority;
    if (clvRanking)      filter.clvRanking      = clvRanking;
    if (businessModel)   filter.businessModel   = businessModel;
    if (isDuplicate !== undefined) filter.isDuplicate = isDuplicate === "true";

    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const { prospects, total } = await prospectRepository.findAll({
      filter, page: Number(page), limit: Number(limit), sort,
    });

    return {
      prospects,
      pagination: {
        total, page: Number(page), limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  // Get single prospect by ID
  getById: async (id) => {
    const prospect = await prospectRepository.findById(id);
    if (!prospect) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }
    return prospect;
  },

  // Update prospect fields
  update: async (id, data) => {
    const exists = await prospectRepository.findById(id);
    if (!exists) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }
    return await prospectRepository.update(id, data);
  },

  // Delete prospect permanently
  delete: async (id) => {
    const exists = await prospectRepository.findById(id);
    if (!exists) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }
    await prospectRepository.delete(id);
    return { message: "Prospect deleted successfully" };
  },

  // ── NEW: Calculate score for one prospect and save results to DB ────────────
  // This is the main scoring function — works with or without AI
  //
  // WITHOUT AI: user fills financialCapacity, strategicValue, marginPotential,
  //             techAdoptionProfile manually → call this → score saved
  //
  // WITH AI: enrichment.service.js fills those fields via Gemini →
  //          then calls this → score saved automatically
  //
  // What gets saved to DB after this runs:
  //   techFitScore   → 0, 60, or 90 based on tech adoption profile
  //   finalScore     → the calculated number (0-108 range)
  //   clvRanking     → Tier-A / Tier-B / Tier-C
  //   salesPriority  → P1 / P2 / P3 / P4 / null
  calculateAndSaveScore: async (prospectId) => {
    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }

    // Run the scoring formula from scoring.js
    const result = calculateScore(prospect);

    // Save all scoring outputs back to DB
    await prospectRepository.update(prospectId, {
      techFitScore:  result.techFitScore,
      finalScore:    result.finalScore,
      clvRanking:    result.clvRanking,
      salesPriority: result.salesPriority,
    });

    return result;
  },

  // ── NEW: Get score breakdown for one prospect (read-only, no DB save) ────────
  // Used by the frontend scoring tab to show how the score was calculated
  // Returns step-by-step breakdown: formula, each component value
  getScoreBreakdown: async (prospectId) => {
    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }

    // Run scoring but don't save — just return the breakdown
    const result = calculateScore(prospect);
    return {
      prospect: {
        accountName:       prospect.accountName,
        techAdoptionProfile: prospect.techAdoptionProfile,
        financialCapacity:   prospect.financialCapacity,
        strategicValue:      prospect.strategicValue,
        marginPotential:     prospect.marginPotential,
        intentSignal:        prospect.intentSignal,
        currentScores: {
          techFitScore:  prospect.techFitScore,
          finalScore:    prospect.finalScore,
          clvRanking:    prospect.clvRanking,
          salesPriority: prospect.salesPriority,
        },
      },
      calculated: result,
    };
  },

  // ── NEW: Manual tier override ────────────────────────────────────────────────
  // Sometimes a salesperson knows better than the formula
  // e.g. "This is a strategic client even though score is low"
  // overrideReason is saved so team knows why it was manually changed
  overrideTier: async (prospectId, { clvRanking, salesPriority, overrideReason }) => {
    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }

    const updateData = {};
    if (clvRanking)    updateData.clvRanking    = clvRanking;
    if (salesPriority) updateData.salesPriority = salesPriority;
    if (overrideReason) updateData.comments = `[Manual Override] ${overrideReason}`;

    return await prospectRepository.update(prospectId, updateData);
  },

  // ── NEW: Bulk re-tier all prospects ─────────────────────────────────────────
  // Runs calculateAndSaveScore on every prospect in the DB
  // Used when: scoring formula changes, or "Re-Tier All" button clicked
  // Processes one by one to avoid memory issues with large datasets
  bulkReTier: async () => {
    // Get all prospects without pagination limit
    const { prospects } = await prospectRepository.findAll({
      filter: {}, page: 1, limit: 999999, sort: { createdAt: -1 },
    });

    const results = { success: 0, failed: 0, errors: [] };

    for (const prospect of prospects) {
      try {
        const result = calculateScore(prospect);
        await prospectRepository.update(prospect._id, {
          techFitScore:  result.techFitScore,
          finalScore:    result.finalScore,
          clvRanking:    result.clvRanking,
          salesPriority: result.salesPriority,
        });
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push({ id: prospect._id, name: prospect.accountName, error: err.message });
      }
    }

    return results;
  },

  // Export all matching prospects to Excel file — FR-2.2
  // Supports same filters as getAll, no pagination limit
  exportToExcel: async (query) => {
    const { search, primaryIndustry, country, salesPriority, clvRanking, businessModel } = query;

    const filter = {};
    if (search)          filter.$or            = [{ accountName: { $regex: search, $options: "i" } }, { website: { $regex: search, $options: "i" } }];
    if (primaryIndustry) filter.primaryIndustry = primaryIndustry;
    if (country)         filter.country         = { $regex: country, $options: "i" };
    if (salesPriority)   filter.salesPriority   = salesPriority;
    if (clvRanking)      filter.clvRanking      = clvRanking;
    if (businessModel)   filter.businessModel   = businessModel;

    // Fetch all records without pagination limit
    const { prospects } = await prospectRepository.findAll({
      filter, page: 1, limit: 999999, sort: { createdAt: -1 },
    });

    // Map each prospect to a flat row for Excel
    const rows = prospects.map((p) => ({
      "Account Name":         p.accountName        || "",
      "Website":              p.website            || "",
      "Primary Industry":     p.primaryIndustry    || "",
      "Business Model":       p.businessModel      || "",
      "Country":              p.country            || "",
      "HQ City":              p.hqLocationCity     || "",
      "Annual Revenue":       p.annualRevenue      || "",
      "Employees":            p.noOfEmployees      || "",
      "Tech Stack":           p.primaryTechStack   || "",
      "Tech2":                p.secondaryTechStack || "",
      "Tech3":                p.tertiaryTechStack  || "",
      "Tech Fit Score":       p.techFitScore       ?? "",
      "Final Score":          p.finalScore         ?? "",
      "Sales Priority":       p.salesPriority      || "",
      "CLV Ranking":          p.clvRanking         || "",
      "Intent Signal":        p.intentSignal       || "",
      "Financial Capacity":   p.financialCapacity  || "",
      "Campaign Name":        p.campaignName       || "",
      "Comments":             p.comments           || "",
      "Source":               p.accountSource      || "",
      "Contact Name":         p.contacts?.[0]?.name        || "",
      "Designation":          p.contacts?.[0]?.designation || "",
      "Department":           p.contacts?.[0]?.department  || "",
      "Email":                p.contacts?.[0]?.email       || "",
      "Phone 1":              p.contacts?.[0]?.phone       || "",
      "Phone 2":              p.contacts?.[0]?.phone2      || "",
      "LinkedIn":             p.contacts?.[0]?.linkedIn    || "",
    }));

    // Build Excel workbook from rows array
    const worksheet = utils.json_to_sheet(rows);
    const workbook  = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, "Prospects");

    // Return as buffer — no file saved to disk
    const buffer   = write(workbook, { type: "buffer", bookType: "xlsx" });
    const filename = `prospects_${new Date().toISOString().split("T")[0]}.xlsx`;

    return { buffer, filename };
  },
};

export default prospectService;
