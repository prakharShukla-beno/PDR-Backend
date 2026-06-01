import icpRepository from "./icp.repository.js";
import Prospect from "../prospect/prospect.model.js";
import Contact from "../contacts/contact.model.js";

// Region → Countries mapping (matches image 1 reference)
const REGION_COUNTRIES = {
  "Asia-Pacific (APAC)":   ["China", "Japan", "India", "Australia", "South Korea", "Indonesia", "Singapore"],
  "Middle East":           ["Saudi Arabia", "UAE", "Israel", "Qatar", "Kuwait", "Jordan", "Oman"],
  "Africa":                ["Nigeria", "South Africa", "Kenya", "Egypt", "Ghana", "Ethiopia"],
  "Europe":                ["Germany", "UK", "France", "Italy", "Spain", "Netherlands", "Switzerland"],
  "North America (NA)":    ["United States", "Canada"],
  "Latin America (LATAM)": ["Brazil", "Mexico", "Argentina", "Chile", "Colombia", "Peru"],
};

// Expand regions to country arrays — used in DB query
const expandRegions = (regions = []) => {
  const countries = [];
  for (const region of regions) {
    if (REGION_COUNTRIES[region]) {
      countries.push(...REGION_COUNTRIES[region]);
    }
  }
  return [...new Set(countries)];
};

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

  // ── Match prospects by ICP criteria ───────────────────────────────────────
  matchProspects: async (id, { page = 1, limit = 10 }) => {
    const profile = await icpRepository.findById(id);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }

    const filter = {};

    // Company filters
    if (profile.industries?.length > 0)
      filter.primaryIndustry = { $in: profile.industries };
    if (profile.businessModels?.length > 0)
      filter.businessModel   = { $in: profile.businessModels };
    if (profile.annualRevenues?.length > 0)
      filter.annualRevenue   = { $in: profile.annualRevenues };
    if (profile.employeeRanges?.length > 0)
      filter.noOfEmployees   = { $in: profile.employeeRanges };

    // ── Target Market filter ─────────────────────────────────────────────────
    // Build included country set from regions + explicit countries
    const regionIncludedCountries = expandRegions(profile.targetRegionsInclude || []);
    const allIncluded = [
      ...new Set([...regionIncludedCountries, ...(profile.targetCountriesInclude || [])]),
    ];

    // Build excluded country set from:
    //   1. Fully excluded regions
    //   2. Per-country exclusions within included regions (e.g. include APAC but exclude Pakistan)
    //   3. Explicit country exclusions
    const regionExcludedCountries = expandRegions(profile.targetRegionsExclude || []);
    const allExcluded = [
      ...new Set([
        ...regionExcludedCountries,
        ...(profile.targetRegionCountriesExclude || []),
        ...(profile.targetCountriesExclude || []),
      ]),
    ];

    if (allIncluded.length > 0 && allExcluded.length > 0) {
      // Include some, exclude some — $in the included set minus excluded
      const finalIncluded = allIncluded.filter(c => !allExcluded.includes(c));
      if (finalIncluded.length > 0) filter.country = { $in: finalIncluded };
    } else if (allIncluded.length > 0) {
      filter.country = { $in: allIncluded };
    } else if (allExcluded.length > 0) {
      filter.country = { $nin: allExcluded };
    }
    // If neither — no country filter applied (match all countries)

    const skip = (Number(page) - 1) * Number(limit);

    const [prospects, total] = await Promise.all([
      Prospect.find(filter)
        .select("accountName website primaryIndustry country businessModel annualRevenue noOfEmployees techFitScore salesPriority clvRanking intentSignal")
        .sort({ techFitScore: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Prospect.countDocuments(filter),
    ]);

    // Contact counts per prospect
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

  // ── Buyer persona match ───────────────────────────────────────────────────
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

    const contactFilter = { isLinked: true };

    // Fixed: separate if-blocks for each persona field
    if (persona.targetDepartments.length > 0) {
      contactFilter.functionalDomain = { $in: persona.targetDepartments };
    }
    if (persona.targetSeniorities.length > 0) {
      contactFilter.seniority = { $in: persona.targetSeniorities };
    }
    if (persona.targetDesignations.length > 0) {
      contactFilter.standardizedRoles = {
        $in: persona.targetDesignations.map(d => new RegExp(d, "i")),
      };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [contacts, total] = await Promise.all([
      Contact.find(contactFilter)
        .populate("accountId", "accountName website primaryIndustry country techFitScore salesPriority clvRanking")
        .sort({ "accountId.techFitScore": -1 })
        .skip(skip)
        .limit(Number(limit)),
      Contact.countDocuments(contactFilter),
    ]);

    const accountMap = {};
    contacts.forEach(contact => {
      const accId = contact.accountId?._id?.toString();
      if (!accId) return;
      if (!accountMap[accId]) {
        accountMap[accId] = { account: contact.accountId, bestContact: contact, totalMatches: 1 };
      } else {
        accountMap[accId].totalMatches++;
      }
    });

    const results = Object.values(accountMap).sort((a, b) => b.totalMatches - a.totalMatches);

    return {
      icpProfile:   { id: profile._id, name: profile.name },
      buyerPersona: persona,
      prospects:    results,
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
