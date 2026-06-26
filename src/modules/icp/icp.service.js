import icpRepository from "./icp.repository.js";
import ICP from "./icp.model.js";
import Prospect from "../prospect/prospect.model.js";
import Contact from "../contacts/contact.model.js";
import segmentRepository from "../segment/segment.repository.js";
import { calculateIcpMatchScore } from "../../common/utils/icpScoring.js";
import {
  buildIcpScoreUpdate,
  resolveTechFitScore,
} from "../../common/utils/icpScoreHelpers.js";
import { invalidateIcpScores } from "../../common/services/icpScoreService.js";
import { companyFilter, companyMatchStage } from "../../common/utils/tenantScope.js";

const REGION_COUNTRIES = {
  "North America (NA)": ["United States", "Canada", "Mexico"],
  "Europe": [
    "United Kingdom", "Germany", "France", "Netherlands", "Sweden",
    "Norway", "Denmark", "Finland", "Switzerland", "Austria", "Belgium",
    "Spain", "Italy", "Portugal", "Ireland", "Poland", "Czech Republic",
    "Hungary", "Romania", "Bulgaria", "Greece", "Croatia", "Slovakia",
    "Slovenia", "Estonia", "Latvia", "Lithuania", "Luxembourg", "Malta",
    "Cyprus", "Iceland", "Serbia", "Ukraine", "Belarus", "Bosnia and Herzegovina",
  ],
  "Asia-Pacific (APAC)": [
    "China", "Japan", "South Korea", "Australia", "New Zealand",
    "Hong Kong", "Taiwan", "Macau", "Mongolia", "Papua New Guinea",
    "Fiji", "Samoa", "Tonga", "Vanuatu", "Solomon Islands",
  ],
  "South Asia": [
    "India", "Pakistan", "Bangladesh", "Sri Lanka", "Nepal",
    "Bhutan", "Maldives", "Afghanistan",
  ],
  "Southeast Asia": [
    "Singapore", "Indonesia", "Malaysia", "Thailand", "Vietnam",
    "Philippines", "Myanmar", "Cambodia", "Laos", "Brunei",
    "Timor-Leste",
  ],
  "Middle East": [
    "Turkey", "Israel", "Jordan", "Lebanon", "Syria", "Iraq",
    "Iran", "Yemen", "Oman", "Kuwait", "Bahrain", "Qatar",
  ],
  "GCC": [
    "Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait",
    "Bahrain", "Oman",
  ],
  "Latin America (LATAM)": [
    "Brazil", "Mexico", "Argentina", "Colombia", "Chile", "Peru",
    "Venezuela", "Ecuador", "Bolivia", "Paraguay", "Uruguay",
    "Costa Rica", "Panama", "Guatemala", "Honduras", "El Salvador",
    "Nicaragua", "Dominican Republic", "Cuba", "Puerto Rico",
    "Trinidad and Tobago", "Jamaica",
  ],
  "Africa": [
    "South Africa", "Nigeria", "Kenya", "Egypt", "Ghana", "Ethiopia",
    "Tanzania", "Uganda", "Rwanda", "Senegal", "Ivory Coast",
    "Cameroon", "Angola", "Mozambique", "Zambia", "Zimbabwe",
    "Morocco", "Tunisia", "Algeria", "Libya", "Sudan",
  ],
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

const pillarScore = (pillarBreakdown) => {
  if (!pillarBreakdown || typeof pillarBreakdown !== "object") return null;
  return Object.values(pillarBreakdown).reduce(
    (sum, entry) => sum + (entry?.score ?? 0),
    0
  );
};

const toPillarBreakdown = (scoreResult) => ({
  firmographic: { score: pillarScore(scoreResult.breakdown.firmographic) },
  market:       { score: pillarScore(scoreResult.breakdown.market) },
  tech:         { score: pillarScore(scoreResult.breakdown.tech) },
  persona:      { score: pillarScore(scoreResult.breakdown.persona) },
});

/** Build MongoDB filter for ICP → prospect matching */
const buildProspectMatchFilter = (profile) => {
  const conditions = [];

  // Match sector-level (industries/commercialSectors) AND leaf-level (mappedIndustries)
  // Prospects often store sector in primaryIndustry e.g. "IT & ITES"
  const industryTargets = [
    ...new Set([
      ...(profile.mappedIndustries || []),
      ...(profile.industries || []),
      ...(profile.commercialSectors || []),
    ]),
  ];
  if (industryTargets.length > 0) {
    conditions.push({ primaryIndustry: { $in: industryTargets } });
  }

  // Optional — if empty, skip filter; if set, match value OR missing data on prospect
  if (profile.businessModels?.length > 0) {
    conditions.push(lenientFieldInFilter("businessModel", profile.businessModels));
  }
  if (profile.commercialCategories?.length > 0) {
    conditions.push(lenientFieldInFilter("commercialCategory", profile.commercialCategories));
  }
  if (profile.annualRevenues?.length > 0) {
    conditions.push(lenientFieldInFilter("annualRevenue", profile.annualRevenues));
  }
  if (profile.employeeRanges?.length > 0) {
    conditions.push(lenientFieldInFilter("noOfEmployees", profile.employeeRanges));
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

  // Tech: match any included tool OR allow empty/missing/unparsed string (enrich later)
  // Buyer persona is scoring-only — never applied here (see icpScoring.js)
  if (profile.techStackInclude?.length > 0) {
    conditions.push({
      $or: [
        { primaryTechStack: { $in: profile.techStackInclude } },
        hasNoTechStack,
        { primaryTechStack: { $type: "string" } },
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

/** Match ICP values OR allow missing prospect data (scored lower in icpScoring) */
const lenientFieldInFilter = (field, values) => ({
  $or: [{ [field]: { $in: values } }, ...emptyFieldFilter(field).$or],
});

/** Diagnose missing prospect data for active ICP filters (0-match scenarios) */
const buildMatchDiagnosis = async (profile, companyId) => {
    const diagnosis      = {};
    const totalProspects = await Prospect.countDocuments(companyFilter(companyId, {}));
  if (totalProspects === 0) return diagnosis;

  if (profile.mappedIndustries?.length > 0) {
    const nullCount = await Prospect.countDocuments(companyFilter(companyId, emptyFieldFilter("primaryIndustry")));
    if (nullCount > 0) {
      diagnosis.primaryIndustry = {
        nullCount,
        totalProspects,
        percentage: Math.round((nullCount / totalProspects) * 100),
      };
    }
  }

  if (profile.employeeRanges?.length > 0) {
    const nullCount = await Prospect.countDocuments(companyFilter(companyId, emptyFieldFilter("noOfEmployees")));
    if (nullCount > 0) {
      diagnosis.employeeRange = {
        nullCount,
        totalProspects,
        percentage: Math.round((nullCount / totalProspects) * 100),
      };
    }
  }

  if (profile.annualRevenues?.length > 0) {
    const nullCount = await Prospect.countDocuments(companyFilter(companyId, emptyFieldFilter("annualRevenue")));
    if (nullCount > 0) {
      diagnosis.annualRevenue = {
        nullCount,
        totalProspects,
        percentage: Math.round((nullCount / totalProspects) * 100),
      };
    }
  }

  if (profile.targetRegionsInclude?.length > 0 || profile.targetCountriesInclude?.length > 0) {
    const nullCount = await Prospect.countDocuments(companyFilter(companyId, emptyFieldFilter("country")));
    if (nullCount > 0) {
      diagnosis.country = {
        nullCount,
        totalProspects,
        percentage: Math.round((nullCount / totalProspects) * 100),
      };
    }
  }

  if (profile.techCategoriesInclude?.length > 0 || profile.techStackInclude?.length > 0) {
    const nullCount = await Prospect.countDocuments(companyFilter(companyId, hasNoTechStack));
    if (nullCount > 0) {
      diagnosis.techStack = {
        nullCount,
        totalProspects,
        percentage: Math.round((nullCount / totalProspects) * 100),
      };
    }
  }

  if (profile.buyerPersona?.designations?.length > 0) {
    const accountsWithContactRoles = await Contact.distinct("accountId", {
      companyId,
      isLinked: true,
      standardizedRoles: { $nin: [null, ""] },
    });
    const nullCount = totalProspects - accountsWithContactRoles.length;
    if (nullCount > 0) {
      diagnosis.designation = {
        nullCount,
        totalProspects,
        percentage: Math.round((nullCount / totalProspects) * 100),
      };
    }
  }

  return diagnosis;
};

const ALLOWED_ICP_FIELDS = [
  "name", "description", "industries", "commercialSectors", "subSectors",
  "mappedIndustries", "businessModels", "annualRevenues", "employeeRanges",
  "commercialCategories", "targetRegionsInclude", "targetRegionsExclude",
  "targetRegionCountriesExclude", "targetCountriesInclude", "targetCountriesExclude",
  "techStackInclude", "techStackExclude", "techCategoriesInclude", "techCategoriesExclude",
  "buyerPersona", "isActive", "isBenchmark",
];

const normalizeBuyerPersona = (persona = {}) => ({
  functionalDomains: Array.isArray(persona.functionalDomains) ? persona.functionalDomains : [],
  seniorityLevels:   Array.isArray(persona.seniorityLevels)   ? persona.seniorityLevels   : [],
  designations:      Array.isArray(persona.designations)      ? persona.designations      : [],
});

/** Pick only schema-known fields and normalize nested buyerPersona */
const sanitizeIcpPayload = (data = {}) => {
  const payload = {};

  for (const key of ALLOWED_ICP_FIELDS) {
    if (data[key] !== undefined) payload[key] = data[key];
  }

  // Legacy / mistaken frontend keys → canonical schema fields
  if (!payload.targetRegionsInclude?.length && Array.isArray(data.regionsInclude)) {
    payload.targetRegionsInclude = data.regionsInclude;
  }
  if (!payload.targetRegionsExclude?.length && Array.isArray(data.regionsExclude)) {
    payload.targetRegionsExclude = data.regionsExclude;
  }
  if (!payload.targetCountriesInclude?.length && Array.isArray(data.countriesInclude)) {
    payload.targetCountriesInclude = data.countriesInclude;
  }
  if (!payload.targetCountriesExclude?.length && Array.isArray(data.countriesExclude)) {
    payload.targetCountriesExclude = data.countriesExclude;
  }
  if (Array.isArray(data.countries) && !payload.targetCountriesInclude?.length) {
    payload.targetCountriesInclude = data.countries;
  }

  if (data.buyerPersona !== undefined || payload.buyerPersona !== undefined) {
    payload.buyerPersona = normalizeBuyerPersona(data.buyerPersona ?? payload.buyerPersona);
  }

  if (payload.description === "") payload.description = null;

  return payload;
};

const icpService = {

  create: async (data, userId, companyId) => {
    const payload = sanitizeIcpPayload(data);
    return await icpRepository.create({ ...payload, createdBy: userId, companyId });
  },

  getAll: async ({ page, limit, isActive, companyId }) => {
    const { profiles, total } = await icpRepository.findAll({ page, limit, isActive, companyId });
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

  getById: async (id, companyId) => {
    const profile = await icpRepository.findById(id, companyId);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }
    return profile;
  },

  update: async (id, data, companyId) => {
    const profile = await icpRepository.findById(id, companyId);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }
    return await icpRepository.update(id, sanitizeIcpPayload(data), companyId);
  },

  delete: async (id, companyId) => {
    const profile = await icpRepository.findById(id, companyId);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }
    await icpRepository.delete(id, companyId);
    return { message: "ICP profile deleted successfully" };
  },

  // ── Match prospects by ICP criteria ───────────────────────────────────────
  matchProspects: async (id, { page = 1, limit = 10, companyId }) => {
    const profile = await icpRepository.findById(id, companyId);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }

    const icpFilter = buildProspectMatchFilter(profile);
    const filter = Object.keys(icpFilter).length > 0
      ? { $and: [companyFilter(companyId, {}), icpFilter] }
      : companyFilter(companyId, {});
    console.log("[matchProspects] ICP filter:", JSON.stringify(filter));

    const skip = (Number(page) - 1) * Number(limit);

    const [prospects, total] = await Promise.all([
      Prospect.find(filter)
        .select(
          "accountName website primaryIndustry country businessModel annualRevenue " +
          "noOfEmployees primaryTechStack techFitScore salesPriority clvRanking " +
          "intentSignal technologyAlignment techFitScoreIcp"
        )
        .sort({ techFitScore: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Prospect.countDocuments(filter),
    ]);

    console.log("[matchProspects] total matches:", total);
    if (prospects.length > 0) {
      console.log(
        "Sample prospect techStack:",
        prospects[0]?.primaryTechStack,
        typeof prospects[0]?.primaryTechStack
      );
    } else {
      const sample = await Prospect.findOne(companyFilter(companyId, {}))
        .select("accountName primaryIndustry noOfEmployees country primaryTechStack")
        .lean();
      console.log("[matchProspects] 0 matches — sample prospect in DB:", sample);
    }

    // Contact counts per prospect
    const prospectIds = prospects.map(p => p._id);
    const contactCounts = await Contact.aggregate([
      { $match: { companyId, accountId: { $in: prospectIds } } },
      { $group: { _id: "$accountId", count: { $sum: 1 } } },
    ]);
    const countMap = {};
    contactCounts.forEach(c => { countMap[c._id.toString()] = c.count; });

    const enrichedProspects = await Promise.all(
      prospects.map(async (p) => {
        const prospectObj = p.toObject();
        const scoreResult = await calculateIcpMatchScore(
          prospectObj,
          profile,
          Contact
        );
        const techFitScore = resolveTechFitScore(
          prospectObj,
          scoreResult.techFitScore
        );
        const scoreUpdate = buildIcpScoreUpdate({
          icpMatchScore:  scoreResult.icpMatchScore,
          techFitScore,
          breakdown:      toPillarBreakdown(scoreResult),
          intentSignal:   prospectObj.intentSignal,
          benchmarkIcpId: profile._id,
        });

        console.log(
          `ICP Match ${prospectObj.accountName}: ` +
          `ICP=${scoreResult.icpMatchScore}, ` +
          `TechFit=${techFitScore}(${scoreUpdate.techFitBand}), ` +
          `Final=${scoreUpdate.icpFinalScore}, ` +
          `alignment=${prospectObj.technologyAlignment ?? "none"}, ` +
          `icpSection=${scoreResult.techFitScore ?? "none"}`
        );

        return {
          _id:                  prospectObj._id,
          accountName:          prospectObj.accountName,
          website:              prospectObj.website,
          primaryIndustry:      prospectObj.primaryIndustry,
          country:              prospectObj.country,
          businessModel:        prospectObj.businessModel,
          annualRevenue:        prospectObj.annualRevenue,
          noOfEmployees:        prospectObj.noOfEmployees,
          primaryTechStack:     prospectObj.primaryTechStack,
          intentSignal:         prospectObj.intentSignal,
          technologyAlignment:  prospectObj.technologyAlignment,
          clvRanking:           prospectObj.clvRanking,
          icpMatchScore:        scoreUpdate.icpMatchScore,
          icpFinalScore:        scoreUpdate.icpFinalScore,
          techFitScoreIcp:      scoreUpdate.techFitScoreIcp,
          techFitBand:          scoreUpdate.techFitBand,
          icpTier:              scoreUpdate.icpTier,
          icpSalesPriority:     scoreUpdate.icpSalesPriority,
          icpScoredAt:          scoreUpdate.icpScoredAt,
          icpScoreBreakdown:    scoreResult.breakdown,
          contactCount:         countMap[p._id.toString()] || 0,
        };
      })
    );

    enrichedProspects.sort(
      (a, b) => (b.icpFinalScore ?? 0) - (a.icpFinalScore ?? 0)
    );

    const updateOps = enrichedProspects.map((prospect) => {
      const flatBreakdown = {
        firmographic: pillarScore(prospect.icpScoreBreakdown?.firmographic),
        market:       pillarScore(prospect.icpScoreBreakdown?.market),
        tech:         pillarScore(prospect.icpScoreBreakdown?.tech),
        persona:      pillarScore(prospect.icpScoreBreakdown?.persona),
      };

      return {
        updateOne: {
          filter: { _id: prospect._id },
          update: {
            $set: {
              icpMatchScore:     prospect.icpMatchScore,
              icpFinalScore:     prospect.icpFinalScore,
              techFitScoreIcp:   prospect.techFitScoreIcp,
              techFitBand:       prospect.techFitBand,
              icpTier:           prospect.icpTier,
              icpSalesPriority:  prospect.icpSalesPriority,
              salesPriority:     prospect.icpSalesPriority,
              icpScoreBreakdown: flatBreakdown,
              icpBenchmarkRef:   profile._id,
              icpScoredAt:       prospect.icpScoredAt ?? new Date(),
              icpScoreStale:     false,
            },
          },
        },
      };
    });

    if (updateOps.length > 0) {
      await Prospect.bulkWrite(updateOps, { ordered: false });
      console.log(
        `ICP Match: saved scores for ${updateOps.length} prospects`
      );
    }

    const responseProspects = enrichedProspects.map((prospect) => {
      const updateOp = updateOps.find(
        (op) => op.updateOne.filter._id.toString() === prospect._id.toString()
      );
      if (!updateOp) return prospect;

      const saved = updateOp.updateOne.update.$set;
      return {
        ...prospect,
        icpMatchScore:    saved.icpMatchScore,
        icpFinalScore:    saved.icpFinalScore,
        techFitScoreIcp:  saved.techFitScoreIcp,
        techFitBand:      saved.techFitBand,
        icpTier:          saved.icpTier,
        icpSalesPriority: saved.icpSalesPriority,
      };
    });

    responseProspects.sort(
      (a, b) => (b.icpFinalScore ?? 0) - (a.icpFinalScore ?? 0)
    );

    const totalProspectsInDb = await Prospect.countDocuments(companyFilter(companyId, {}));
    const matchRatio         = totalProspectsInDb > 0 ? total / totalProspectsInDb : 0;
    const shouldDiagnose     = total === 0 || matchRatio < 0.05;
    const diagnosis          = (shouldDiagnose && total === 0)
      ? await buildMatchDiagnosis(profile, companyId)
      : {};

    return {
      icpProfile: {
        id: profile._id,
        name: profile.name,
        isBenchmark: profile.isBenchmark || false,
      },
      prospects:  responseProspects,
      diagnosis,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  setBenchmark: async (id, companyId) => {
    await ICP.updateMany({ companyId }, { isBenchmark: false });

    const profile = await icpRepository.update(id, { isBenchmark: true }, companyId);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }

    invalidateIcpScores(companyId, false).catch((err) =>
      console.error(
        "ICP invalidation after benchmark change failed:",
        err.message
      )
    );

    return profile;
  },

  getBenchmark: async (companyId) => {
    return await ICP.findOne({ isBenchmark: true, companyId })
      .populate("createdBy", "name email");
  },

  // ── Create segment from ICP matching prospects (one-click) ────────────────
  createSegmentFromIcp: async (id, userId, companyId, options = {}) => {
    const profile = await icpRepository.findById(id, companyId);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }

    const icpFilter = buildProspectMatchFilter(profile);
    const filter = Object.keys(icpFilter).length > 0
      ? { $and: [companyFilter(companyId, {}), icpFilter] }
      : companyFilter(companyId, {});
    const prospects = await Prospect.find(filter).select("_id").lean();
    const ids = prospects.map((p) => p._id);

    if (ids.length === 0) {
      const error = new Error(
        "No prospects match this ICP. Adjust ICP filters before creating a segment."
      );
      error.statusCode = 400;
      throw error;
    }

    const industryTargets = [
      ...new Set([
        ...(profile.mappedIndustries || []),
        ...(profile.industries || []),
        ...(profile.commercialSectors || []),
      ]),
    ];

    const segment = await segmentRepository.create({
      name: options.name?.trim() || `${profile.name} — Segment`,
      description: profile.description || null,
      icpId: profile._id,
      companyId,
      createdBy: userId,
      isShared: options.isShared ?? false,
      filters: {
        industries: industryTargets,
        businessModels: profile.businessModels || [],
        employeeRanges: profile.employeeRanges || [],
        annualRevenues: profile.annualRevenues || [],
        countries: profile.targetCountriesInclude || [],
      },
      matchedAccountIds: [],
      matchCount: 0,
      lastSyncedAt: null,
      enrichStatus: "pending",
    });

    await segmentRepository.saveSnapshot(segment._id, ids, companyId);
    return await segmentRepository.findById(segment._id, companyId);
  },

  matchBuyerPersona: async (id, { page = 1, limit = 10, companyId }) => {
    const profile = await icpRepository.findById(id, companyId);
    if (!profile) {
      const error = new Error("ICP profile not found");
      error.statusCode = 404;
      throw error;
    }

    const persona = profile.buyerPersona || {};
    const designations =
      persona.designations?.length > 0
        ? persona.designations
        : (persona.targetDesignations || []);

    if (designations.length === 0) {
      const error = new Error("No buyer persona designations defined in this ICP profile");
      error.statusCode = 400;
      throw error;
    }

    const contactFilter = companyFilter(companyId, { isLinked: true });

    contactFilter.standardizedRoles = {
      $in: designations.map((d) => new RegExp(escapeRegex(d), "i")),
    };

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

export { buildProspectMatchFilter };
export default icpService;
