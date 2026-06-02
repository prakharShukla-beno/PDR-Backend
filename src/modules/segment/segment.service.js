import segmentRepository from "./segment.repository.js";
import Prospect from "../prospect/prospect.model.js";

const segmentService = {

  // Build MongoDB query from segment filters
  buildQuery: (filters = {}) => {
    const query = {};
    if (filters.industries?.length)      query.primaryIndustry = { $in: filters.industries };
    if (filters.businessModels?.length)  query.businessModel   = { $in: filters.businessModels };
    if (filters.countries?.length)       query.country         = { $in: filters.countries };
    if (filters.employeeRanges?.length)  query.noOfEmployees   = { $in: filters.employeeRanges };
    if (filters.annualRevenues?.length)  query.annualRevenue   = { $in: filters.annualRevenues };
    if (filters.salesPriorities?.length) query.salesPriority   = { $in: filters.salesPriorities };
    if (filters.intentSignals?.length)   query.intentSignal    = { $in: filters.intentSignals };
    if (filters.minTechFitScore)         query.techFitScore    = { $gte: filters.minTechFitScore };

    // ── NEW: Support tier filtering ──────────────────────────────────────
    if (filters.tierFilter?.length)      query.clvRanking      = { $in: filters.tierFilter };

    // ── NEW: Support priority filtering ──────────────────────────────────
    if (filters.priorityFilter?.length)  query.salesPriority   = { $in: filters.priorityFilter };

    // ── NEW: Support min final score filtering ───────────────────────────
    if (filters.minFinalScore)           query.finalScore      = { $gte: filters.minFinalScore };

    return query;
  },

  // Create segment and take first snapshot immediately
  create: async (data, userId) => {
    // Save segment first
    const segment = await segmentRepository.create({
      ...data,
      createdBy:         userId,
      matchedAccountIds: [],
      matchCount:        0,
      lastSyncedAt:      null,
    });

    // Find all matching prospect IDs and store them
    const query      = segmentService.buildQuery(data.filters || {});
    const prospects  = await Prospect.find(query).select("_id").lean();
    const ids        = prospects.map(p => p._id);
    await segmentRepository.saveSnapshot(segment._id, ids);

    // Return updated segment with count
    return await segmentRepository.findById(segment._id);
  },

  // Get all segments for this user
  getAll: async (userId) => {
    return await segmentRepository.findAll(userId);
  },

  // Get single segment
  getById: async (id) => {
    return await segmentRepository.findById(id);
  },

  // Update segment name/description/filters
  // If filters changed — take new snapshot automatically
  update: async (id, data) => {
    await segmentRepository.update(id, data);

    if (data.filters) {
      // Filters changed — retake snapshot
      const query     = segmentService.buildQuery(data.filters);
      const prospects = await Prospect.find(query).select("_id").lean();
      const ids       = prospects.map(p => p._id);
      await segmentRepository.saveSnapshot(id, ids);
    }

    return await segmentRepository.findById(id);
  },

  // Delete segment
  delete: async (id) => {
    return await segmentRepository.delete(id);
  },

  // Sync — run fresh query against full DB and update snapshot
  // Called when user clicks Sync button
  sync: async (id) => {
    const segment = await segmentRepository.findById(id);
    if (!segment) throw new Error("Segment not found");

    // Run fresh query against current DB
    const query     = segmentService.buildQuery(segment.filters);
    const prospects = await Prospect.find(query).select("_id").lean();
    const ids       = prospects.map(p => p._id);

    // Save new snapshot
    await segmentRepository.saveSnapshot(id, ids);

    return await segmentRepository.findById(id);
  },

  // Get paginated accounts from stored snapshot + tier breakdown
  getStoredAccounts: async (id, page = 1, limit = 10) => {
    const segment = await segmentRepository.findById(id);
    if (!segment) throw new Error("Segment not found");

    const total = segment.matchedAccountIds.length;
    const skip  = (page - 1) * limit;

    // Paginate the stored IDs first
    const pageIds = segment.matchedAccountIds.slice(skip, skip + limit);

    // Fetch only those accounts from DB
    const accounts = await Prospect.find({ _id: { $in: pageIds } })
      .select("accountName website primaryIndustry country techFitScore finalScore salesPriority clvRanking intentSignal noOfEmployees")
      .lean();

    // ── NEW: Calculate tier breakdown for matched accounts ────────────────
    const tierBreakdown = await Prospect.aggregate([
      { $match: { _id: { $in: segment.matchedAccountIds } } },
      { $group: {
          _id: "$clvRanking",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const breakdown = {
      "Tier-A (Strategic)": 0,
      "Tier-B (Core)": 0,
      "Tier-C (Mass)": 0,
    };
    tierBreakdown.forEach(tb => {
      if (tb._id && breakdown[tb._id] !== undefined) {
        breakdown[tb._id] = tb.count;
      }
    });

    // ── NEW: Calculate priority breakdown ────────────────────────────────
    const priorityBreakdown = await Prospect.aggregate([
      { $match: { _id: { $in: segment.matchedAccountIds } } },
      { $group: {
          _id: "$salesPriority",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const priorities = {
      "P1 (Tier A+Active)": 0,
      "P2 (Tier B+Active)": 0,
      "P3 (Tier A+Cold)": 0,
      "P4 (Tier B+Cold)": 0,
    };
    priorityBreakdown.forEach(pb => {
      if (pb._id && priorities[pb._id] !== undefined) {
        priorities[pb._id] = pb.count;
      }
    });

    return {
      accounts,
      total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / limit),
      tierBreakdown: breakdown,
      priorityBreakdown: priorities,
    };
  },

  // Preview — count + top 5 without saving — for live filter preview
  preview: async (filters = {}) => {
    const query = segmentService.buildQuery(filters);

    const [count, topAccounts] = await Promise.all([
      Prospect.countDocuments(query),
      Prospect.find(query)
        .select("accountName primaryIndustry techFitScore finalScore salesPriority clvRanking country")
        .sort({ finalScore: -1 })
        .limit(5)
        .lean(),
    ]);

    return { count, topAccounts };
  },
};

export default segmentService;