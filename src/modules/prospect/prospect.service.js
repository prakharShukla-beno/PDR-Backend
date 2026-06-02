import prospectRepository from "./prospect.repository.js";
import duplicateRepository from "../duplicate/duplicate.repository.js";
import scoringEngine from "../../common/utils/scoring.js";
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
      "Job1":                 p.contacts?.[0]?.job1        || "",
      "Job2":                 p.contacts?.[0]?.job2        || "",
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

  // ── FR-6.1: Calculate and update final score for a prospect ──────────────
  calculateAndUpdateScore: async (id) => {
    const prospect = await prospectRepository.findById(id);
    if (!prospect) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }

    // Step 1: Calculate final score using scoring engine
    const scoreResult = scoringEngine.calculateFinalScore(prospect);

    // Step 2: If tech fit fails, disqualify
    if (!scoreResult.metadata.techFitMultiplier || scoreResult.metadata.techFitMultiplier === 0) {
      const updateData = {
        finalScore: 0,
        status: "disqualified",
        disqualificationReason: "Tech Stack Incompatible",
        disqualifiedAt: new Date(),
        scoringMetadata: scoreResult.metadata,
      };
      return await prospectRepository.update(id, updateData);
    }

    // Step 3: Assign tier based on final score
    const tierResult = scoringEngine.assignTierFromScore(scoreResult.finalScore);

    // Step 4: Get intent level and assign priority
    const intentLevel = scoringEngine.getIntentLevel(prospect.intentSignal);
    const priorityResult = scoringEngine.assignPriorityFromTierAndIntent(
      tierResult.tier,
      prospect.intentSignal
    );

    // Step 5: Update prospect with all scoring results
    const updateData = {
      finalScore: scoreResult.finalScore,
      scoringMetadata: scoreResult.metadata,
      status: "active",
      clvRanking: tierResult.tier,
      salesPriority: priorityResult.priority,
    };

    return await prospectRepository.update(id, updateData);
  },

  // ── FR-6.2: Bulk recalculate scores for all prospects ────────────────────
  bulkRecalculateScores: async (filter = {}) => {
    // Fetch all prospects matching filter
    const { prospects } = await prospectRepository.findAll({
      filter,
      page: 1,
      limit: 999999,
    });

    const results = {
      total: prospects.length,
      updated: 0,
      disqualified: 0,
      errors: [],
    };

    // Recalculate score for each prospect
    for (const prospect of prospects) {
      try {
        // Calculate score
        const scoreResult = scoringEngine.calculateFinalScore(prospect);

        // Prepare update data
        let updateData = {
          finalScore: scoreResult.finalScore,
          scoringMetadata: scoreResult.metadata,
        };

        // If disqualified
        if (scoreResult.status === "disqualified") {
          updateData = {
            ...updateData,
            status: "disqualified",
            disqualificationReason: scoreResult.disqualificationReason,
            disqualifiedAt: new Date(),
          };
          results.disqualified++;
        } else {
          // If active, assign tier and priority
          const tierResult = scoringEngine.assignTierFromScore(scoreResult.finalScore);
          const priorityResult = scoringEngine.assignPriorityFromTierAndIntent(
            tierResult.tier,
            prospect.intentSignal
          );

          updateData = {
            ...updateData,
            status: "active",
            clvRanking: tierResult.tier,
            salesPriority: priorityResult.priority,
          };
        }

        // Update in DB
        await prospectRepository.update(prospect._id, updateData);
        results.updated++;
      } catch (err) {
        results.errors.push({
          prospectId: prospect._id,
          accountName: prospect.accountName,
          error: err.message,
        });
      }
    }

    return results;
  },

  // ── FR-6.3: Get score breakdown for debugging ──────────────────────────
  getScoreBreakdown: async (id) => {
    const prospect = await prospectRepository.findById(id);
    if (!prospect) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }

    const scoreResult = scoringEngine.calculateFinalScore(prospect);
    const tierResult = scoreResult.finalScore > 0 
      ? scoringEngine.assignTierFromScore(scoreResult.finalScore)
      : null;
    
    const priorityResult = tierResult
      ? scoringEngine.assignPriorityFromTierAndIntent(tierResult.tier, prospect.intentSignal)
      : null;

    return {
      prospect: {
        id: prospect._id,
        accountName: prospect.accountName,
        primaryIndustry: prospect.primaryIndustry,
        annualRevenue: prospect.annualRevenue,
        strategicValue: prospect.strategicValue,
        financialCapacity: prospect.financialCapacity,
      },
      scoring: {
        revenuePoints: scoreResult.metadata.revenuePoints || 0,
        strategyBonus: scoreResult.metadata.strategyBonus || 0,
        industryMultiplier: scoreResult.metadata.industryMultiplier || 1.0,
        techFitMultiplier: scoreResult.metadata.techFitMultiplier || 0.0,
        finalScore: scoreResult.finalScore,
      },
      tier: tierResult,
      priority: priorityResult,
      steps: scoreResult.steps,
      metadata: scoreResult.metadata,
    };
  },
};

export default prospectService;