import icpRepository from "./icp.repository.js";
import Prospect from "../prospect/prospect.model.js";

const icpService = {

  // Naya ICP profile create karo
  create: async (data, userId) => {
    return await icpRepository.create({ ...data, createdBy: userId });
  },

  // Saare ICP profiles fetch karo
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

  // Single ICP profile
  getById: async (id) => {
    const profile = await icpRepository.findById(id);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }
    return profile;
  },

  // ICP profile update karo
  update: async (id, data) => {
    const profile = await icpRepository.findById(id);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }
    return await icpRepository.update(id, data);
  },

  // ICP profile delete karo
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

  // ICP ke criteria se matching prospects dhundo
  matchProspects: async (id, { page = 1, limit = 10 }) => {
    const profile = await icpRepository.findById(id);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }

    // MongoDB filter dynamically build karo ICP criteria se
    const filter = {};

    if (profile.industries.length > 0) {
      filter.primaryIndustry = { $in: profile.industries };
    }
    if (profile.businessModels.length > 0) {
      filter.businessModel = { $in: profile.businessModels };
    }
    if (profile.countries.length > 0) {
      filter.country = { $in: profile.countries };
    }
    if (profile.annualRevenues.length > 0) {
      filter.annualRevenue = { $in: profile.annualRevenues };
    }
    if (profile.employeeRanges.length > 0) {
      filter.noOfEmployees = { $in: profile.employeeRanges };
    }
    if (profile.intentSignals.length > 0) {
      filter.intentSignal = { $in: profile.intentSignals };
    }
    if (profile.minTechFitScore !== null) {
      filter.techFitScore = { $gte: profile.minTechFitScore };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [prospects, total] = await Promise.all([
      Prospect.find(filter)
        .select("accountName website primaryIndustry country businessModel annualRevenue noOfEmployees techFitScore salesPriority clvRanking intentSignal contacts")
        .sort({ techFitScore: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Prospect.countDocuments(filter),
    ]);

    return {
      icpProfile: { id: profile._id, name: profile.name },
      prospects,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  // Buyer persona ke basis par best POC dhundo per prospect
  matchBuyerPersona: async (id, { page = 1, limit = 10 }) => {
    const profile = await icpRepository.findById(id);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }

    const persona = profile.buyerPersona;

    // Koi persona criteria set nahi — error do
    if (
      persona.targetSeniorities.length === 0 &&
      persona.targetDepartments.length === 0 &&
      persona.targetDesignations.length === 0
    ) {
      const error = new Error("No buyer persona criteria defined in this ICP profile");
      error.statusCode = 400;
      throw error;
    }

    // Contacts array ke andar filter lagao — MongoDB aggregation
    const matchStage = {};
    if (persona.targetSeniorities.length > 0) {
      matchStage["contacts.seniority"] = { $in: persona.targetSeniorities };
    }
    if (persona.targetDepartments.length > 0) {
      matchStage["contacts.department"] = { $in: persona.targetDepartments };
    }
    if (persona.targetDesignations.length > 0) {
      matchStage["contacts.designation"] = { $in: persona.targetDesignations };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const results = await Prospect.aggregate([
      { $match: { contacts: { $exists: true, $ne: [] } } },
      { $unwind: "$contacts" },
      { $match: matchStage },
      {
        $group: {
          _id:         "$_id",
          accountName: { $first: "$accountName" },
          website:     { $first: "$website" },
          industry:    { $first: "$primaryIndustry" },
          country:     { $first: "$country" },
          // Best matched contact — first match ko best POC maano
          bestContact: { $first: "$contacts" },
          totalMatches: { $sum: 1 },
        },
      },
      { $sort: { totalMatches: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },
    ]);

    const total = await Prospect.aggregate([
      { $match: { contacts: { $exists: true, $ne: [] } } },
      { $unwind: "$contacts" },
      { $match: matchStage },
      { $group: { _id: "$_id" } },
      { $count: "total" },
    ]);

    return {
      icpProfile: { id: profile._id, name: profile.name },
      buyerPersona: persona,
      prospects: results,
      pagination: {
        total:      total[0]?.total || 0,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil((total[0]?.total || 0) / Number(limit)),
      },
    };
  },
};

export default icpService;