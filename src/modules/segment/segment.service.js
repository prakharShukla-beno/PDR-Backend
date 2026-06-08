import segmentRepository    from "./segment.repository.js";
import Prospect             from "../prospect/prospect.model.js";
import ICP                  from "../icp/icp.model.js";
import enrichmentService    from "../enrichment/enrichment.service.js";
import { calculateScore }   from "../../common/utils/scoring.js";

// ─── Region → Countries map (ICP region logic ke liye) ───────────────────────
// APAC include karo + Pakistan exclude karo — yahi flow yahan handle hota hai
const REGION_COUNTRIES = {
  "Asia-Pacific (APAC)":   ["China", "Japan", "India", "Australia", "South Korea", "Indonesia", "Singapore", "Pakistan", "Bangladesh", "Sri Lanka", "Malaysia", "Thailand", "Vietnam", "Philippines", "New Zealand"],
  "Middle East":           ["Saudi Arabia", "UAE", "Israel", "Qatar", "Kuwait", "Jordan", "Oman", "Bahrain", "Iraq", "Lebanon"],
  "Africa":                ["Nigeria", "South Africa", "Kenya", "Egypt", "Ghana", "Ethiopia", "Tanzania", "Morocco", "Algeria", "Tunisia"],
  "Europe":                ["Germany", "UK", "France", "Italy", "Spain", "Netherlands", "Switzerland", "Sweden", "Norway", "Denmark", "Poland", "Belgium", "Austria", "Portugal", "Finland"],
  "North America (NA)":   ["United States", "Canada"],
  "Latin America (LATAM)":["Brazil", "Mexico", "Argentina", "Chile", "Colombia", "Peru", "Venezuela", "Ecuador", "Uruguay", "Bolivia"],
};

// ── Tech Stack categories — same 9 categories as ICP builder frontend ────────
// Used to: (1) expand category → tools list, (2) determine Core vs Adjacent match
const TECH_STACK_CATEGORIES = {
  "Cloud Provider":      ["aws", "microsoft azure", "google cloud", "gcp", "oracle cloud", "digital ocean", "ibm cloud", "on-premise"],
  "CRM & ERP":          ["salesforce", "hubspot", "sap s/4hana", "sap", "ms dynamics", "dynamics 365", "oracle netsuite", "netsuite", "zoho", "odoo", "pipedrive"],
  "Frontend Framework": ["react", "angular", "vue.js", "vue", "next.js", "nextjs", "svelte", "jquery", "flutter"],
  "Backend / Language": ["python", "django", "flask", "node.js", "nodejs", "java", "spring", "php", "laravel", "ruby on rails", "rails", ".net", "dotnet", "go", "golang"],
  "Database":           ["postgresql", "postgres", "mysql", "mongodb", "oracle db", "oracle database", "snowflake", "redis", "dynamodb"],
  "DevOps & CI/CD":     ["jenkins", "github actions", "gitlab ci", "gitlab", "docker", "kubernetes", "k8s", "terraform", "circleci", "azure devops"],
  "Marketing Tech":     ["marketo", "mailchimp", "klaviyo", "adobe experience", "pardot", "active campaign", "activecampaign"],
  "E-commerce":         ["shopify", "magento", "woocommerce", "bigcommerce", "salesforce commerce"],
  "Cybersecurity":      ["crowdstrike", "okta", "palo alto", "zscaler", "splunk", "cloudflare"],
};

// Helper: tool string se uski category find karo
// e.g. "IBM Cloud" → "Cloud Provider"
const getToolCategory = (toolName) => {
  const t = toolName.toLowerCase().trim();
  for (const [category, tools] of Object.entries(TECH_STACK_CATEGORIES)) {
    if (tools.some(ct => t.includes(ct) || ct.includes(t))) return category;
  }
  return null; // unknown / legacy tool
};

// Helper: category ke saare tools return karo
const expandCategory = (categoryName) => {
  return TECH_STACK_CATEGORIES[categoryName] || [];
};

// Region names → flat countries array
const expandRegions = (regionNames = []) => {
  const countries = [];
  for (const region of regionNames) {
    const list = REGION_COUNTRIES[region] || [];
    countries.push(...list);
  }
  return [...new Set(countries)];
};

const segmentService = {

  // ─── Build MongoDB query ─────────────────────────────────────────────────
  // icpProfile optional — agar diya toh ICP ka region logic use karega
  // Warna flat countries[] se filter karega (manual segment)
  buildQuery: (filters = {}, icpProfile = null) => {
    const query = {};

    if (filters.industries?.length)      query.primaryIndustry = { $in: filters.industries };
    if (filters.businessModels?.length)  query.businessModel   = { $in: filters.businessModels };
    if (filters.employeeRanges?.length)  query.noOfEmployees   = { $in: filters.employeeRanges };
    if (filters.annualRevenues?.length)  query.annualRevenue   = { $in: filters.annualRevenues };
    if (filters.salesPriorities?.length) query.salesPriority   = { $in: filters.salesPriorities };
    if (filters.intentSignals?.length)   query.intentSignal    = { $in: filters.intentSignals };
    if (filters.minTechFitScore)         query.techFitScore    = { $gte: filters.minTechFitScore };
    if (filters.tierFilter?.length)      query.clvRanking      = { $in: filters.tierFilter };
    if (filters.priorityFilter?.length)  query.salesPriority   = { $in: filters.priorityFilter };
    if (filters.minFinalScore)           query.finalScore      = { $gte: filters.minFinalScore };

    // ── Country filter — ICP region logic ────────────────────────────────────
    // ICP ka pattern: region include karo, phir specific country exclude karo
    // Example: APAC include → Pakistan exclude
    if (icpProfile) {
      const regionIncluded = expandRegions(icpProfile.targetRegionsInclude || []);
      const regionExcluded = expandRegions(icpProfile.targetRegionsExclude || []);

      // Saare included countries (region se + direct)
      const allIncluded = [...new Set([
        ...regionIncluded,
        ...(icpProfile.targetCountriesInclude || []),
      ])];

      // Saare excluded countries (region se + per-country + direct)
      const allExcluded = [...new Set([
        ...regionExcluded,
        ...(icpProfile.targetRegionCountriesExclude || []),  // e.g. Pakistan
        ...(icpProfile.targetCountriesExclude || []),
      ])];

      if (allIncluded.length > 0 && allExcluded.length > 0) {
        // Include list se excluded hatao
        const finalIncluded = allIncluded.filter(c => !allExcluded.includes(c));
        if (finalIncluded.length > 0) query.country = { $in: finalIncluded };
      } else if (allIncluded.length > 0) {
        query.country = { $in: allIncluded };
      } else if (allExcluded.length > 0) {
        query.country = { $nin: allExcluded };
      }
    } else if (filters.countries?.length) {
      // Manual segment — flat countries array
      query.country = { $in: filters.countries };
    }

    return query;
  },

  // ─── Create segment ──────────────────────────────────────────────────────
  create: async (data, userId) => {
    const segment = await segmentRepository.create({
      ...data,
      createdBy:         userId,
      matchedAccountIds: [],
      matchCount:        0,
      lastSyncedAt:      null,
      enrichStatus:      "pending",
    });

    // ICP se bana tha? Toh ICP ka region logic use karo
    let icpProfile = null;
    if (data.icpId) {
      icpProfile = await ICP.findById(data.icpId).lean();
    }

    const query     = segmentService.buildQuery(data.filters || {}, icpProfile);
    const prospects = await Prospect.find(query).select("_id").lean();
    const ids       = prospects.map(p => p._id);
    await segmentRepository.saveSnapshot(segment._id, ids);

    return await segmentRepository.findById(segment._id);
  },

  // ─── Get all segments ────────────────────────────────────────────────────
  getAll: async (userId) => {
    return await segmentRepository.findAll(userId);
  },

  // ─── Get single segment ──────────────────────────────────────────────────
  getById: async (id) => {
    return await segmentRepository.findById(id);
  },

  // ─── Update segment ──────────────────────────────────────────────────────
  update: async (id, data) => {
    await segmentRepository.update(id, data);

    if (data.filters) {
      const segment    = await segmentRepository.findById(id);
      let icpProfile   = null;
      if (segment?.icpId) {
        icpProfile = await ICP.findById(segment.icpId).lean();
      }

      const query     = segmentService.buildQuery(data.filters, icpProfile);
      const prospects = await Prospect.find(query).select("_id").lean();
      const ids       = prospects.map(p => p._id);
      await segmentRepository.saveSnapshot(id, ids);
    }

    return await segmentRepository.findById(id);
  },

  // ─── Delete segment ──────────────────────────────────────────────────────
  delete: async (id) => {
    return await segmentRepository.delete(id);
  },

  // ─── Sync — fresh query, update snapshot ─────────────────────────────────
  sync: async (id) => {
    const segment = await segmentRepository.findById(id);
    if (!segment) throw new Error("Segment not found");

    let icpProfile = null;
    if (segment.icpId) {
      icpProfile = await ICP.findById(segment.icpId).lean();
    }

    const query     = segmentService.buildQuery(segment.filters, icpProfile);
    const prospects = await Prospect.find(query).select("_id").lean();
    const ids       = prospects.map(p => p._id);
    await segmentRepository.saveSnapshot(id, ids);

    return await segmentRepository.findById(id);
  },

  // ─── Get stored accounts (paginated + tier breakdown) ────────────────────
  getStoredAccounts: async (id, page = 1, limit = 10) => {
    const segment = await segmentRepository.findById(id);
    if (!segment) throw new Error("Segment not found");

    const total  = segment.matchedAccountIds.length;
    const skip   = (page - 1) * limit;
    const pageIds = segment.matchedAccountIds.slice(skip, skip + limit);

    // Fetch accounts — sorted by finalScore (post enrichment) then techFitScore
    const accounts = await Prospect.find({ _id: { $in: pageIds } })
      .select("accountName website primaryIndustry country techFitScore finalScore salesPriority clvRanking intentSignal noOfEmployees primaryTechStack")
      .sort({ finalScore: -1, techFitScore: -1 })
      .lean();

    // Tier breakdown — Tier A/B/C counts
    const tierAgg = await Prospect.aggregate([
      { $match: { _id: { $in: segment.matchedAccountIds } } },
      { $group: { _id: "$clvRanking", count: { $sum: 1 } } },
      { $sort:  { _id: 1 } },
    ]);

    const tierBreakdown = {
      "Tier-A (Strategic)": 0,
      "Tier-B (Core)":      0,
      "Tier-C (Mass)":      0,
    };
    tierAgg.forEach(t => {
      if (t._id && tierBreakdown[t._id] !== undefined) tierBreakdown[t._id] = t.count;
    });

    // Priority breakdown
    const priorityAgg = await Prospect.aggregate([
      { $match: { _id: { $in: segment.matchedAccountIds } } },
      { $group: { _id: "$salesPriority", count: { $sum: 1 } } },
      { $sort:  { _id: 1 } },
    ]);

    const priorityBreakdown = {
      "P1 (Tier A+Active)": 0,
      "P2 (Tier B+Active)": 0,
      "P3 (Tier A+Cold)":   0,
      "P4 (Tier B+Cold)":   0,
    };
    priorityAgg.forEach(p => {
      if (p._id && priorityBreakdown[p._id] !== undefined) priorityBreakdown[p._id] = p.count;
    });

    return {
      accounts,
      total,
      page:              Number(page),
      limit:             Number(limit),
      totalPages:        Math.ceil(total / limit),
      tierBreakdown,
      priorityBreakdown,
      enrichStatus:      segment.enrichStatus,
      enrichedCount:     segment.enrichedCount,
      scoredCount:       segment.scoredCount,
      lastEnrichedAt:    segment.lastEnrichedAt,
    };
  },

  // ─── Preview — count + top 5 (bina save kiye) ────────────────────────────
  preview: async (filters = {}) => {
    const query = segmentService.buildQuery(filters);

    const [count, topAccounts] = await Promise.all([
      Prospect.countDocuments(query),
      Prospect.find(query)
        .select("accountName primaryIndustry techFitScore finalScore salesPriority clvRanking country")
        .sort({ finalScore: -1, techFitScore: -1 })
        .limit(5)
        .lean(),
    ]);

    return { count, topAccounts };
  },

  // ─── Enrich & Score ──────────────────────────────────────────────────────
  // Segment ke matched accounts pe Gemini enrichment chalaao
  // Phir Tech Fit score calculate karo ICP ke techStack se
  // Flow: pending → running → done/partial
  enrichAndScore: async (segmentId, userId) => {
    const segment = await segmentRepository.findById(segmentId);
    if (!segment) throw new Error("Segment not found");

    if (segment.enrichStatus === "running") {
      throw new Error("Enrichment already running for this segment");
    }

    // ICP fetch — techStack ke liye
    let icpProfile = null;
    if (segment.icpId) {
      icpProfile = await ICP.findById(segment.icpId).lean();
    }

    const totalAccounts = segment.matchedAccountIds.length;
    if (totalAccounts === 0) throw new Error("No accounts in segment to enrich");

    // Status running mark karo
    await segmentRepository.update(segmentId, { enrichStatus: "running" });

    // Background mein chalaao — response turant return ho
    // Actual enrichment async hota hai
    setImmediate(async () => {
      let enrichedCount = 0;
      let scoredCount   = 0;
      const errors      = [];

      try {
        // Sirf segment ke accounts fetch karo
        const accounts = await Prospect.find({
          _id: { $in: segment.matchedAccountIds }
        }).select("_id primaryTechStack secondaryTechStack tertiaryTechStack techFitScore").lean();

        // ICP ke included tech stack
        // These are used in loop for category expansion
        const icpTechInclude = icpProfile?.techStackInclude || [];
        const icpTechExclude = icpProfile?.techStackExclude || [];

        for (const account of accounts) {
          try {
            // ── Step 1: Gemini enrich → primaryTechStack fill karo ────────────
            // Sirf tab call karo jab techStack empty ho
            if (!account.primaryTechStack || account.primaryTechStack.length === 0) {
              try {
                await enrichmentService.enrichSingle(account._id.toString(), userId);
                enrichedCount++;
              } catch (enrichErr) {
                errors.push(`Enrich failed ${account._id}: ${enrichErr.message}`);
              }
            } else {
              enrichedCount++; // already enriched
            }

            // ── Step 2: Fresh prospect fetch karo (updated techStack ke saath) ─
            const fresh = await Prospect.findById(account._id)
              .select("_id primaryTechStack intentSignal annualRevenue financialCapacity strategicValue marginPotential")
              .lean();
            if (!fresh) continue;

            const accountStack = (fresh.primaryTechStack || []).map(t => t.toLowerCase().trim());

            // ── Step 3: ICP Tech Fit matching — category-aware ────────────────
            //
            // ICP mein 2 levels hain:
            //   techCategoriesInclude/Exclude → poori category (e.g. Cloud Provider)
            //   techStackInclude/Exclude      → specific tools (e.g. IBM Cloud)
            //
            // Category expand hoti hai → uske saare tools included/excluded maan lo
            // e.g. ICP = Cloud Provider include → AWS, Azure, IBM Cloud... sab included

            const icpCatInclude = icpProfile?.techCategoriesInclude || [];
            const icpCatExclude = icpProfile?.techCategoriesExclude || [];

            // Categories ko tools mein expand karo
            const catIncludeTools = icpCatInclude.flatMap(expandCategory);
            const catExcludeTools = icpCatExclude.flatMap(expandCategory);

            // Specific tools (ICP mein individually selected)
            const specificInclude = (icpProfile?.techStackInclude || []).map(t => t.toLowerCase());
            const specificExclude = (icpProfile?.techStackExclude || []).map(t => t.toLowerCase());

            // Final included/excluded tool sets
            const allIncludedTools = [...new Set([...catIncludeTools, ...specificInclude])];
            const allExcludedTools = [...new Set([...catExcludeTools, ...specificExclude])];

            // ── Excluded check — koi bhi excluded tool/category use karta hai → Disqualify
            const usesExcluded = allExcludedTools.length > 0 &&
              accountStack.some(t => allExcludedTools.some(ex => t.includes(ex) || ex.includes(t)));

            if (usesExcluded) {
              await Prospect.findByIdAndUpdate(account._id, {
                techFitScore: 0, finalScore: 0,
                clvRanking: "Tier-C (Mass)", salesPriority: null,
              });
              scoredCount++;
              continue;
            }

            // ── Core vs Adjacent vs No Match ─────────────────────────────────
            // No ICP tech filter defined → default Core Match (no restriction)
            let techFitMultiplier = 1.0;
            let techFitLabel = "Core Match — no tech filter defined";

            if (allIncludedTools.length > 0) {
              // Account ka har tool → uski category nikalo
              const accountCategories = accountStack
                .map(t => getToolCategory(t))
                .filter(Boolean);

              // Core Match: account ka koi tool included tools mein directly match kare
              const coreMatched = accountStack.filter(t =>
                allIncludedTools.some(inc => t.includes(inc) || inc.includes(t))
              );

              // Adjacent Match: account ka tool kisi included category ka hai
              // lekin specifically listed nahi — compatible hai
              const adjacentMatched = accountCategories.filter(cat =>
                icpCatInclude.includes(cat)
              );

              if (coreMatched.length > 0) {
                // Direct tool match → Core Match
                techFitMultiplier = 1.0;
                techFitLabel = `Core Match — ${coreMatched.length} tool(s) matched`;
              } else if (adjacentMatched.length > 0) {
                // Category match but tool not specifically listed → Adjacent
                techFitMultiplier = 0.5;
                techFitLabel = `Adjacent Match — category matched: ${adjacentMatched.join(", ")}`;
              } else {
                // No match at all → Adjacent by default (not disqualified, just demoted)
                techFitMultiplier = 0.5;
                techFitLabel = "Adjacent Match — no tech overlap found";
              }
            }

            // ── Step 4: Score via central engine (scoring.js) ─────────────────
            const icpForScoring = {
              techStackInclude: allIncludedTools,
              techStackExclude: allExcludedTools,
            };
            const result = calculateScore(fresh, icpForScoring);

            await Prospect.findByIdAndUpdate(account._id, {
              techFitScore:  result.techFitScore,
              finalScore:    result.finalScore,
              clvRanking:    result.clvRanking,
              salesPriority: result.salesPriority,
            });

            scoredCount++;
          } catch (err) {
            errors.push(`Account ${account._id}: ${err.message}`);
          }
        }

        // Final status update
        const finalStatus = errors.length === 0 ? "done" : "partial";
        await segmentRepository.update(segmentId, {
          enrichStatus:  finalStatus,
          enrichedCount,
          scoredCount,
          lastEnrichedAt: new Date(),
        });

        // Snapshot re-sync karo scored data ke saath
        const query     = segmentService.buildQuery(segment.filters, icpProfile);
        const prospects = await Prospect.find(query).select("_id").lean();
        await segmentRepository.saveSnapshot(segmentId, prospects.map(p => p._id));

        console.log(`✅ Segment ${segmentId} enriched — ${scoredCount}/${totalAccounts} scored`);

      } catch (err) {
        console.error(`❌ Segment enrichment failed:`, err.message);
        await segmentRepository.update(segmentId, { enrichStatus: "partial" });
      }
    });

    // Turant response — background mein chal raha hai
    return {
      message:       `Enrichment started for ${totalAccounts} accounts`,
      totalAccounts,
      segmentId,
      status:        "running",
    };
  },
};

export default segmentService;