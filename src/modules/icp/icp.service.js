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

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const countryInFilter = (countries) => ({
  $in: countries.map((c) => new RegExp(`^${escapeRegex(c)}$`, "i")),
});

const countryNinFilter = (countries) => ({
  $nin: countries.map((c) => new RegExp(`^${escapeRegex(c)}$`, "i")),
});

const hasNoTechStack = {
  $or: [
    { primaryTechStack: { $exists: false } },
    { primaryTechStack: null },
    { primaryTechStack: { $size: 0 } },
  ],
};

// Seniority keywords for matching against contact.standardizedRoles (no seniority field on Contact)
const SENIORITY_ROLE_PATTERNS = {
  "C-Suite":   /Chief|CEO|CFO|CTO|COO|CMO|CIO|CPO|President|Founder/i,
  "VP":        /\bVP\b|Vice President/i,
  "Director":  /Director/i,
  "Manager":   /Manager/i,
  "Senior IC": /Senior|Lead|Principal|Staff/i,
};

/** Build MongoDB filter for ICP → prospect matching */
const buildProspectMatchFilter = (profile) => {
  const conditions = [];

  // Prospect.primaryIndustry stores leaf-level values (e.g. "FMCG"), not sector-level
  // (e.g. "Retail, CPG & Hospitality"). Match only against ICP mappedIndustries.
  const mappedIndustries = profile.mappedIndustries || [];
  if (mappedIndustries.length > 0) {
    conditions.push({ primaryIndustry: { $in: mappedIndustries } });
  }
  // Optional — if empty, skip filter so all prospects pass this dimension
  if (profile.businessModels?.length > 0) {
    conditions.push({ businessModel: { $in: profile.businessModels } });
  }
  // Optional — if empty, skip filter so all prospects pass this dimension
  if (profile.commercialCategories?.length > 0) {
    conditions.push({ commercialCategory: { $in: profile.commercialCategories } });
  }
  if (profile.annualRevenues?.length > 0) {
    conditions.push({ annualRevenue: { $in: profile.annualRevenues } });
  }
  if (profile.employeeRanges?.length > 0) {
    conditions.push({ noOfEmployees: { $in: profile.employeeRanges } });
  }

  const regionIncludedCountries = expandRegions(profile.targetRegionsInclude || []);
  const allIncluded = [
    ...new Set([...regionIncludedCountries, ...(profile.targetCountriesInclude || [])]),
  ];
  const regionExcludedCountries = expandRegions(profile.targetRegionsExclude || []);
  const allExcluded = [
    ...new Set([
      ...regionExcludedCountries,
      ...(profile.targetRegionCountriesExclude || []),
      ...(profile.targetCountriesExclude || []),
    ]),
  ];

  if (allIncluded.length > 0 && allExcluded.length > 0) {
    const finalIncluded = allIncluded.filter((c) => !allExcluded.includes(c));
    if (finalIncluded.length > 0) {
      conditions.push({ country: countryInFilter(finalIncluded) });
    }
  } else if (allIncluded.length > 0) {
    conditions.push({ country: countryInFilter(allIncluded) });
  } else if (allExcluded.length > 0) {
    conditions.push({ country: countryNinFilter(allExcluded) });
  }

  // Include: match any listed tool, or allow prospects with no tech data yet
  if (profile.techStackInclude?.length > 0) {
    conditions.push({
      $or: [
        { primaryTechStack: { $in: profile.techStackInclude } },
        hasNoTechStack,
      ],
    });
  }
  if (profile.techStackExclude?.length > 0) {
    conditions.push({ primaryTechStack: { $nin: profile.techStackExclude } });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
};

const emptyFieldFilter = (field) => ({
  $or: [
    { [field]: null },
    { [field]: "" },
    { [field]: { $exists: false } },
  ],
});

/** Diagnose missing prospect data for active ICP filters (0-match scenarios) */
const buildMatchDiagnosis = async (profile) => {
  const diagnosis      = {};
  const totalProspects = await Prospect.countDocuments({});
  if (totalProspects === 0) return diagnosis;

  if (profile.mappedIndustries?.length > 0) {
    const nullCount = await Prospect.countDocuments(emptyFieldFilter("primaryIndustry"));
    if (nullCount > 0) {
      diagnosis.primaryIndustry = {
        nullCount,
        totalProspects,
        percentage: Math.round((nullCount / totalProspects) * 100),
      };
    }
  }

  if (profile.employeeRanges?.length > 0) {
    const nullCount = await Prospect.countDocuments(emptyFieldFilter("noOfEmployees"));
    if (nullCount > 0) {
      diagnosis.employeeRange = {
        nullCount,
        totalProspects,
        percentage: Math.round((nullCount / totalProspects) * 100),
      };
    }
  }

  if (profile.annualRevenues?.length > 0) {
    const nullCount = await Prospect.countDocuments(emptyFieldFilter("annualRevenue"));
    if (nullCount > 0) {
      diagnosis.annualRevenue = {
        nullCount,
        totalProspects,
        percentage: Math.round((nullCount / totalProspects) * 100),
      };
    }
  }

  return diagnosis;
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

    const filter = buildProspectMatchFilter(profile);

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

    const totalProspectsInDb = await Prospect.countDocuments({});
    const matchRatio         = totalProspectsInDb > 0 ? total / totalProspectsInDb : 0;
    const shouldDiagnose     = total === 0 || matchRatio < 0.05;
    const diagnosis          = (shouldDiagnose && total === 0)
      ? await buildMatchDiagnosis(profile)
      : {};

    return {
      icpProfile: { id: profile._id, name: profile.name },
      prospects:  enrichedProspects,
      diagnosis,
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
      const patterns = persona.targetSeniorities
        .map((s) => SENIORITY_ROLE_PATTERNS[s])
        .filter(Boolean);
      if (patterns.length > 0) {
        contactFilter.standardizedRoles = {
          $regex: patterns.map((p) => p.source).join("|"),
          $options: "i",
        };
      }
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
