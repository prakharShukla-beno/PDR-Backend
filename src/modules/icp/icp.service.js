import icpRepository from "./icp.repository.js";
import Prospect from "../prospect/prospect.model.js";
import Contact from "../contacts/contact.model.js";   // ← ADD: Contact collection

const icpService = {

  create: async (data, userId) => {
    return await icpRepository.create({ ...data, createdBy: userId });
  },

  getAll: async ({ page, limit, isActive }) => {
    const { profiles, total } = await icpRepository.findAll({ page, limit, isActive });
    return {
      profiles,
      pagination: {
        total,
        page:       Number(page) || 1,
        limit:      Number(limit) || 10,
        totalPages: Math.ceil(total / (Number(limit) || 10)),
      },
    };
  },

  getById: async (id) => {
    const profile = await icpRepository.findById(id);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }
    return profile;
  },

  update: async (id, data) => {
    const profile = await icpRepository.findById(id);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }
    return await icpRepository.update(id, data);
  },

  delete: async (id) => {
    const profile = await icpRepository.findById(id);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }
    await icpRepository.delete(id);
    return { message: "ICP profile deleted successfully" };
  },

  // ── ICP criteria se matching prospects ──────────────────────────────────────
  matchProspects: async (id, { page = 1, limit = 10 }) => {
    const profile = await icpRepository.findById(id);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }

    const filter = {};
    if (profile.industries.length > 0)
      filter.primaryIndustry = { $in: profile.industries };
    if (profile.businessModels.length > 0)
      filter.businessModel   = { $in: profile.businessModels };
    if (profile.countries.length > 0)
      filter.country         = { $in: profile.countries };
    if (profile.annualRevenues.length > 0)
      filter.annualRevenue   = { $in: profile.annualRevenues };
    if (profile.employeeRanges.length > 0)
      filter.noOfEmployees   = { $in: profile.employeeRanges };
    if (profile.intentSignals.length > 0)
      filter.intentSignal    = { $in: profile.intentSignals };
    if (profile.minTechFitScore !== null)
      filter.techFitScore    = { $gte: profile.minTechFitScore };

    const skip = (Number(page) - 1) * Number(limit);

    const [prospects, total] = await Promise.all([
      Prospect.find(filter)
        .select("accountName website primaryIndustry country businessModel annualRevenue noOfEmployees techFitScore salesPriority clvRanking intentSignal")
        .sort({ techFitScore: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Prospect.countDocuments(filter),
    ]);

    // Har prospect ke contact count bhi do
    const prospectIds = prospects.map(p => p._id);
    const contactCounts = await Contact.aggregate([
      { $match: { accountId: { $in: prospectIds } } },
      { $group: { _id: "$accountId", count: { $sum: 1 } } },
    ]);
    const countMap = {};
    contactCounts.forEach(c => { countMap[c._id.toString()] = c.count; });

    const enrichedProspects = prospects.map(p => ({
      ...p.toObject(),
      contactCount: countMap[p._id.toString()] || 0,
    }));

    return {
      icpProfile: { id: profile._id, name: profile.name },
      prospects:  enrichedProspects,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  // ── FR-6.2: Buyer persona — best POC suggest karo ───────────────────────────
  // FIX: contacts[] embedded se Contact collection pe
  matchBuyerPersona: async (id, { page = 1, limit = 10 }) => {
    const profile = await icpRepository.findById(id);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }

    const persona = profile.buyerPersona;

    if (
      persona.targetSeniorities.length  === 0 &&
      persona.targetDepartments.length  === 0 &&
      persona.targetDesignations.length === 0
    ) {
      const error = new Error("No buyer persona criteria defined in this ICP profile");
      error.statusCode = 400;
      throw error;
    }

    // ── Contact collection se filter karo — naya architecture ─────────────
    const contactFilter = { isLinked: true };

    if (persona.targetSeniorities.length > 0) {
      // functionalDomain = department jaisa hai hamare schema mein
      contactFilter.functionalDomain = { $in: persona.targetDepartments };
    }
    if (persona.targetDesignations.length > 0) {
      contactFilter.standardizedRoles = {
        $in: persona.targetDesignations.map(d => new RegExp(d, "i")),
      };
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Contact collection se matching contacts + account info
    const [contacts, total] = await Promise.all([
      Contact.find(contactFilter)
        .populate("accountId", "accountName website primaryIndustry country techFitScore salesPriority clvRanking")
        .sort({ "accountId.techFitScore": -1 })
        .skip(skip)
        .limit(Number(limit)),
      Contact.countDocuments(contactFilter),
    ]);

    // Account ke hisaab se group karo — best contact per account
    const accountMap = {};
    contacts.forEach(contact => {
      const accId = contact.accountId?._id?.toString();
      if (!accId) return;
      if (!accountMap[accId]) {
        accountMap[accId] = {
          account:    contact.accountId,
          bestContact: contact,
          totalMatches: 1,
        };
      } else {
        accountMap[accId].totalMatches++;
      }
    });

    const results = Object.values(accountMap)
      .sort((a, b) => b.totalMatches - a.totalMatches);

    return {
      icpProfile:  { id: profile._id, name: profile.name },
      buyerPersona: persona,
      prospects:   results,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },
};

export default icpService;