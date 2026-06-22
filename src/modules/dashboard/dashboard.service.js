import Prospect   from "../prospect/prospect.model.js";

import Contact    from "../contacts/contact.model.js";

import Enrichment from "../enrichment/enrichment.model.js";

import Duplicate  from "../duplicate/duplicate.model.js";

import ImportLog  from "../importLog/importLog.model.js";

import Interaction from "../interaction/interaction.model.js";

import {
  companyFilter,
  companyMatchStage,
  companyObjectId,
  requireCompanyId,
} from "../../common/utils/tenantScope.js";



/** Enrichment has no companyId — scope via linked prospect */

const countEnrichmentsForCompany = async (companyId, match = {}) => {

  const cId = companyObjectId(companyId);

  const [result] = await Enrichment.aggregate([

    {

      $lookup: {

        from:         "prospects",

        localField:   "prospectId",

        foreignField: "_id",

        as:           "prospect",

      },

    },

    { $unwind: "$prospect" },

    { $match: { "prospect.companyId": cId, ...match } },

    { $count: "total" },

  ]);

  return result?.total ?? 0;

};



/** Duplicate has no companyId — scope via prospectId1 on Prospect or Contact */

const buildDuplicateCompanyFilter = async (companyId) => {

  const cid = requireCompanyId(companyId);

  const [prospectIds, contactIds] = await Promise.all([

    Prospect.distinct("_id", { companyId: cid }),

    Contact.distinct("_id", { companyId: cid }),

  ]);

  return {

    $or: [

      { prospectId1: { $in: prospectIds } },

      { prospectId1: { $in: contactIds } },

    ],

  };

};



const countDuplicatesForCompany = async (companyId, extra = {}) => {

  const companyScope = await buildDuplicateCompanyFilter(companyId);

  return Duplicate.countDocuments({ ...extra, ...companyScope });

};



/** Interaction has no companyId — scope via linked prospect */

const countInteractionsForCompany = async (companyId) => {

  const cId = companyObjectId(companyId);

  const [result] = await Interaction.aggregate([

    {

      $lookup: {

        from:         "prospects",

        localField:   "prospectId",

        foreignField: "_id",

        as:           "prospect",

      },

    },

    { $unwind: "$prospect" },

    { $match: { "prospect.companyId": cId } },

    { $count: "total" },

  ]);

  return result?.total ?? 0;

};



const interactionCompanyStages = (companyId) => {

  const cId = companyObjectId(companyId);

  return [

    {

      $lookup: {

        from:         "prospects",

        localField:   "prospectId",

        foreignField: "_id",

        as:           "prospect",

      },

    },

    { $unwind: "$prospect" },

    { $match: { "prospect.companyId": cId } },

  ];

};



const duplicateCompanyStages = (companyId) => {

  const cId = companyObjectId(companyId);

  return [

    {

      $lookup: {

        from:         "prospects",

        localField:   "prospectId1",

        foreignField: "_id",

        as:           "p1",

      },

    },

    {

      $lookup: {

        from:         "contacts",

        localField:   "prospectId1",

        foreignField: "_id",

        as:           "c1",

      },

    },

    {

      $match: {

        $or: [

          { "p1.companyId": cId },

          { "c1.companyId": cId },

        ],

      },

    },

  ];

};



const dashboardService = {



  getSummary: async (companyId) => {

    const prospectFilter = companyFilter(companyId, {});

    const enrichedFilter = companyFilter(companyId, { financialCapacity: { $ne: null } });



    const [

      totalProspects, duplicateCount, enrichedCount,

      icpMatchCount, pendingDuplicates, totalInteractions,

    ] = await Promise.all([

      Prospect.countDocuments(prospectFilter),

      Prospect.countDocuments(companyFilter(companyId, { isDuplicate: true })),

      Prospect.countDocuments(enrichedFilter),

      countEnrichmentsForCompany(companyId, { icpMatch: true }),

      countDuplicatesForCompany(companyId, { status: "pending" }),

      countInteractionsForCompany(companyId),

    ]);



    return {

      totalProspects, duplicateCount, enrichedCount,

      icpMatchCount, pendingDuplicates, totalInteractions,

      enrichmentCoverage: totalProspects > 0

        ? Math.round((enrichedCount / totalProspects) * 100) : 0,

    };

  },



  getByIndustry: async (companyId) => {

    return await Prospect.aggregate([

      companyMatchStage(companyId, { primaryIndustry: { $ne: null } }),

      { $group: { _id: "$primaryIndustry", count: { $sum: 1 } } },

      { $sort: { count: -1 } },

      { $project: { _id: 0, industry: "$_id", count: 1 } },

    ]);

  },



  getByCountry: async (companyId) => {

    return await Prospect.aggregate([

      companyMatchStage(companyId, { country: { $ne: null } }),

      { $group: { _id: "$country", count: { $sum: 1 } } },

      { $sort: { count: -1 } },

      { $limit: 15 },

      { $project: { _id: 0, country: "$_id", count: 1 } },

    ]);

  },



  getBySalesPriority: async (companyId) => {

    return await Prospect.aggregate([

      companyMatchStage(companyId, { salesPriority: { $ne: null } }),

      { $group: { _id: "$salesPriority", count: { $sum: 1 } } },

      { $sort: { _id: 1 } },

      { $project: { _id: 0, priority: "$_id", count: 1 } },

    ]);

  },



  getByCLV: async (companyId) => {

    return await Prospect.aggregate([

      companyMatchStage(companyId, { clvRanking: { $ne: null } }),

      { $group: { _id: "$clvRanking", count: { $sum: 1 } } },

      { $sort: { count: -1 } },

      { $project: { _id: 0, clvRanking: "$_id", count: 1 } },

    ]);

  },



  getTopProspects: async (companyId, { limit = 10 }) => {

    return await Prospect.find(companyFilter(companyId, { salesPriority: "P1 (Tier A+Active)" }))

      .select("accountName website primaryIndustry country salesPriority clvRanking techFitScore")

      .sort({ techFitScore: -1 })

      .limit(Number(limit));

  },



  getEnrichmentActivity: async (companyId) => {

    const thirtyDaysAgo = new Date();

    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const cId = companyObjectId(companyId);



    const companyEnrichmentStages = [

      {

        $lookup: {

          from:         "prospects",

          localField:   "prospectId",

          foreignField: "_id",

          as:           "prospect",

        },

      },

      { $unwind: "$prospect" },

      { $match: { "prospect.companyId": cId } },

    ];



    const [dailyActivity, icpTrue, icpFalse, highValue] = await Promise.all([

      Enrichment.aggregate([

        ...companyEnrichmentStages,

        { $match: { enrichedAt: { $gte: thirtyDaysAgo } } },

        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$enrichedAt" } }, count: { $sum: 1 } } },

        { $sort: { _id: 1 } },

        { $project: { _id: 0, date: "$_id", count: 1 } },

      ]),

      countEnrichmentsForCompany(companyId, { icpMatch: true }),

      countEnrichmentsForCompany(companyId, { icpMatch: false }),

      countEnrichmentsForCompany(companyId, { strategicCategory: "High Value" }),

    ]);



    return {

      dailyActivity,

      icpMatch:       { matched: icpTrue, notMatched: icpFalse },

      highValueCount: highValue,

    };

  },



  getDuplicateSummary: async (companyId) => {

    return await Duplicate.aggregate([

      ...duplicateCompanyStages(companyId),

      { $group: { _id: "$status", count: { $sum: 1 } } },

      { $project: { _id: 0, status: "$_id", count: 1 } },

    ]);

  },



  getImportHistory: async (companyId) => {

    return await ImportLog.find({ companyId })

      .populate("uploadedBy", "name email")

      .sort({ createdAt: -1 })

      .limit(10)

      .select("fileName importType totalRows successCount failedCount status createdAt uploadedBy");

  },



  getInteractionBreakdown: async (companyId) => {

    const stages = interactionCompanyStages(companyId);

    const [byType, byOutcome] = await Promise.all([

      Interaction.aggregate([

        ...stages,

        { $group: { _id: "$type", count: { $sum: 1 } } },

        { $sort: { count: -1 } },

        { $project: { _id: 0, type: "$_id", count: 1 } },

      ]),

      Interaction.aggregate([

        ...stages,

        { $match: { outcome: { $ne: null } } },

        { $group: { _id: "$outcome", count: { $sum: 1 } } },

        { $sort: { count: -1 } },

        { $project: { _id: 0, outcome: "$_id", count: 1 } },

      ]),

    ]);

    return { byType, byOutcome };

  },



  getAiInsight: async (companyId) => {

    const totalProspects = await Prospect.countDocuments(companyFilter(companyId, {}));

    if (totalProspects === 0) {

      return {

        confidence:  0,

        signal:      null,

        industry:    null,

        title:       "No insights yet",

        description: "Import prospects to unlock AI-powered insights for your workspace.",

        stats: { accountsWithSignal: 0, avgTechFitScore: 0, newP1ThisWeek: 0, totalP1: 0 },

        cta:         "Import accounts",

      };

    }



    const thirtyDaysAgo = new Date();

    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);



    const weekAgo = new Date();

    weekAgo.setDate(weekAgo.getDate() - 7);



    const intentTrends = await Prospect.aggregate([

      companyMatchStage(companyId, { intentSignal: { $ne: null }, createdAt: { $gte: thirtyDaysAgo } }),

      { $group: { _id: "$intentSignal", count: { $sum: 1 }, avgScore: { $avg: "$techFitScore" } } },

      { $sort: { count: -1 } },

      { $limit: 1 },

    ]);



    const industryTrends = await Prospect.aggregate([

      companyMatchStage(companyId, { primaryIndustry: { $ne: null }, techFitScore: { $gte: 70 } }),

      { $group: { _id: "$primaryIndustry", count: { $sum: 1 } } },

      { $sort: { count: -1 } },

      { $limit: 1 },

    ]);



    const [newP1ThisWeek, totalP1] = await Promise.all([

      Prospect.countDocuments(companyFilter(companyId, { salesPriority: "P1 (Tier A+Active)", createdAt: { $gte: weekAgo } })),

      Prospect.countDocuments(companyFilter(companyId, { salesPriority: "P1 (Tier A+Active)" })),

    ]);



    const topIntent   = intentTrends[0]?._id  || null;

    const topIndustry = industryTrends[0]?._id || null;

    const topCount    = intentTrends[0]?.count || 0;

    const avgScore    = Math.round(intentTrends[0]?.avgScore || 0);



    const confidence  = topCount > 0 ? Math.min(95, 60 + Math.floor(topCount / 5)) : 0;



    return {

      confidence,

      signal:      topIntent,

      industry:    topIndustry,

      title:       topCount > 0

        ? `${topCount} ${topIndustry} accounts showing "${topIntent}" signal`

        : "No strong signals detected yet",

      description: topCount > 0

        ? `Average tech fit score: ${avgScore}. P1 accounts added this week: ${newP1ThisWeek}.`

        : "Enrich more accounts to surface intent and industry patterns.",

      stats: { accountsWithSignal: topCount, avgTechFitScore: avgScore, newP1ThisWeek, totalP1 },

      cta:   "Review accounts",

    };

  },



  getTopMovers: async (companyId, { limit = 5 }) => {

    const weekAgo = new Date();

    weekAgo.setDate(weekAgo.getDate() - 7);



    const movers = await Prospect.find(companyFilter(companyId, {

      techFitScore: { $ne: null },

      createdAt:    { $gte: weekAgo },

    }))

      .select("accountName primaryIndustry techFitScore salesPriority")

      .sort({ techFitScore: -1 })

      .limit(Number(limit));



    return movers.map((p) => ({

      _id:           p._id,

      accountName:   p.accountName,

      industry:      p.primaryIndustry,

      score:         p.techFitScore,

      scoreChange:   null,

      salesPriority: p.salesPriority,

    }));

  },



  /** Exposed for duplicate.service — build company-scoped duplicate filter */

  getDuplicateCompanyFilter: buildDuplicateCompanyFilter,

};



export default dashboardService;


