import prospectRepository from "./prospect.repository.js";
import duplicateRepository from "../duplicate/duplicate.repository.js";
import { calculateScore }   from "../../common/utils/scoring.js";
import pkg from "xlsx";
import Contact from "../contacts/contact.model.js";
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

  // ── Suggest POC via Gemini AI ─────────────────────────────────────────────
  // Scenario 1: contacts exist → pick best match based on ICP buyer persona
  // Scenario 2: no contacts   → suggest target role + LinkedIn search tip
  suggestPoc: async (prospectId) => {
    // Get prospect data
    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      const err = new Error("Prospect not found");
      err.statusCode = 404;
      throw err;
    }

    // Fetch all contacts linked to this account
    const contacts = await Contact.find({ accountId: prospectId })
      .select("firstName lastName email standardizedRoles functionalDomain isPrimary")
      .lean();

    // Build Gemini prompt — different for each scenario
    const contactList = contacts.length > 0
      ? contacts.map((c, i) =>
          `${i + 1}. ${c.firstName || ""} ${c.lastName || ""} | Role: ${c.standardizedRoles || "Unknown"} | Dept: ${c.functionalDomain || "Unknown"} | Email: ${c.email || "N/A"}`
        ).join("\n")
      : "No contacts available";

    const prompt = `
You are a B2B sales intelligence assistant.

Company Info:
- Name: ${prospect.accountName}
- Industry: ${prospect.primaryIndustry || "N/A"}
- Business Model: ${prospect.businessModel || "N/A"}
- Employees: ${prospect.noOfEmployees || "N/A"}
- Revenue: ${prospect.annualRevenue || "N/A"}
- Intent Signal: ${prospect.intentSignal || "N/A"}
- CLV Ranking: ${prospect.clvRanking || "N/A"}

Existing Contacts:
${contactList}

Task:
${contacts.length > 0
  ? "From the contacts above, identify who is the BEST point of contact (decision maker) for a B2B sales outreach. Pick one."
  : "No contacts exist. Suggest the best TARGET ROLE to find on LinkedIn for B2B sales outreach."
}

Return ONLY valid JSON (no markdown, no explanation):
${contacts.length > 0
  ? `{
  "scenario": "contacts_exist",
  "recommendedIndex": <0-based index from contacts list>,
  "recommendedRole": "<their role>",
  "reason": "<1 line why this person>",
  "confidenceLevel": "High | Medium | Low"
}`
  : `{
  "scenario": "no_contacts",
  "recommendedContactId": null,
  "targetRole": "<best role to search>",
  "targetDepartment": "<department>",
  "searchSuggestion": "<one line — what to search on LinkedIn>",
  "reason": "<1 line why this role>",
  "confidenceLevel": "High | Medium | Low"
}`
}`;

    // Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response  = await fetch(geminiUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) {
      const err = new Error("Gemini API error");
      err.statusCode = 502;
      throw err;
    }

    const data    = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = content.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Could not parse Gemini response");
    }

    // Scenario 1 — attach the actual contact object to result
    if (parsed.scenario === "contacts_exist" && parsed.recommendedIndex != null) {
      const recommended = contacts[parsed.recommendedIndex] || null;
      return {
        scenario:          "contacts_exist",
        recommendedContact: recommended,
        reason:            parsed.reason,
        confidenceLevel:   parsed.confidenceLevel,
      };
    }

    // Scenario 2 — no contacts, return role suggestion
    return {
      scenario:         "no_contacts",
      targetRole:       parsed.targetRole,
      targetDepartment: parsed.targetDepartment,
      searchSuggestion: parsed.searchSuggestion,
      reason:           parsed.reason,
      confidenceLevel:  parsed.confidenceLevel,
    };
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
