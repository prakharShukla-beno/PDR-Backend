import Prospect from "../prospect/prospect.model.js";
import Enrichment from "../enrichment/enrichment.model.js";
import Duplicate from "../duplicate/duplicate.model.js";
import ImportLog from "../importLog/importLog.model.js";
import Interaction from "../interaction/interaction.model.js";

const dashboardService = {

  // Sabka summary ek call mein — main dashboard widget
  getSummary: async () => {
    const [
      totalProspects,
      duplicateCount,
      enrichedCount,
      icpMatchCount,
      pendingDuplicates,
      totalInteractions,
    ] = await Promise.all([
      Prospect.countDocuments(),
      Prospect.countDocuments({ isDuplicate: true }),
      Enrichment.countDocuments(),
      Enrichment.countDocuments({ icpMatch: true }),
      Duplicate.countDocuments({ status: "pending" }),
      Interaction.countDocuments(),
    ]);

    return {
      totalProspects,
      duplicateCount,
      enrichedCount,
      icpMatchCount,
      pendingDuplicates,
      totalInteractions,
      enrichmentCoverage: totalProspects > 0
        ? Math.round((enrichedCount / totalProspects) * 100)
        : 0,
    };
  },

  // Prospects by industry — pie/bar chart ke liye
  getByIndustry: async () => {
    const data = await Prospect.aggregate([
      { $match: { primaryIndustry: { $ne: null } } },
      { $group: { _id: "$primaryIndustry", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, industry: "$_id", count: 1 } },
    ]);
    return data;
  },

  // Prospects by country — geography widget
  getByCountry: async () => {
    const data = await Prospect.aggregate([
      { $match: { country: { $ne: null } } },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
      { $project: { _id: 0, country: "$_id", count: 1 } },
    ]);
    return data;
  },

  // Prospects by salesPriority — P1/P2/P3/P4 breakdown
  getBySalesPriority: async () => {
    const data = await Prospect.aggregate([
      { $match: { salesPriority: { $ne: null } } },
      { $group: { _id: "$salesPriority", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, priority: "$_id", count: 1 } },
    ]);
    return data;
  },

  // Prospects by CLV ranking — Tier-A / B / C
  getByCLV: async () => {
    const data = await Prospect.aggregate([
      { $match: { clvRanking: { $ne: null } } },
      { $group: { _id: "$clvRanking", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, clvRanking: "$_id", count: 1 } },
    ]);
    return data;
  },

  // Top priority prospects — P1 + highest techFitScore wale
  getTopProspects: async ({ limit = 10 }) => {
    const data = await Prospect.find({ salesPriority: "P1 (Tier A+Active)" })
      .select("accountName website primaryIndustry country salesPriority clvRanking techFitScore")
      .sort({ techFitScore: -1 })
      .limit(Number(limit));
    return data;
  },

  // Enrichment activity — last 30 days + ICP breakdown
  getEnrichmentActivity: async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [dailyActivity, icpTrue, icpFalse, highValue] = await Promise.all([
      Enrichment.aggregate([
        { $match: { enrichedAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id:   { $dateToString: { format: "%Y-%m-%d", date: "$enrichedAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: "$_id", count: 1 } },
      ]),
      Enrichment.countDocuments({ icpMatch: true }),
      Enrichment.countDocuments({ icpMatch: false }),
      Enrichment.countDocuments({ strategicCategory: "High Value" }),
    ]);

    return {
      dailyActivity,
      icpMatch:       { matched: icpTrue, notMatched: icpFalse },
      highValueCount: highValue,
    };
  },

  // Duplicate summary — pending/merged/dismissed
  getDuplicateSummary: async () => {
    const data = await Duplicate.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $project: { _id: 0, status: "$_id", count: 1 } },
    ]);
    return data;
  },

  // Import history — last 10 imports
  getImportHistory: async () => {
    return await ImportLog.find()
      .populate("uploadedBy", "name email")
      .sort({ createdAt: -1 })
      .limit(10)
      .select("fileName importType totalRows successCount failedCount status createdAt uploadedBy");
  },

  // Interaction breakdown by type + outcome
  getInteractionBreakdown: async () => {
    const [byType, byOutcome] = await Promise.all([
      Interaction.aggregate([
        { $group: { _id: "$type", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, type: "$_id", count: 1 } },
      ]),
      Interaction.aggregate([
        { $match: { outcome: { $ne: null } } },
        { $group: { _id: "$outcome", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, outcome: "$_id", count: 1 } },
      ]),
    ]);
    return { byType, byOutcome };
  },
};

export default dashboardService;