import Prospect from "../prospect/prospect.model.js";
import Contact from "../contacts/contact.model.js";
import Segment from "../segment/segment.model.js";
import Campaign from "../campaign/campaign.model.js";
import { expandSectors } from "../../common/utils/industryMapper.js";
import { companyFilter, companyUserIds } from "../../common/utils/tenantScope.js";

const RESULT_LIMIT_PER_TYPE = 5;

const escapeRegex = (value) =>
  value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const contactDisplayName = (contact) => {
  const full = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return full || contact.email || "Unnamed contact";
};

// ─── Helper: Build Include/Exclude filter ──────────────────────────────────
// inc = ["Healthcare", "SaaS"]  → $in
// exc = ["Manufacturing"]       → $nin
// Both include and exclude may be provided
const buildIncExcFilter = (inc, exc) => {
  const filter = {};
  const incArr = toArray(inc);
  const excArr = toArray(exc);
  if (incArr.length > 0) filter.$in  = incArr;
  if (excArr.length > 0) filter.$nin = excArr;
  return Object.keys(filter).length > 0 ? filter : null;
};

// ─── Helper: Query param string/array → array ────────────────────────────────
// "Healthcare"          → ["Healthcare"]
// ["Healthcare","SaaS"] → ["Healthcare","SaaS"]
const toArray = (val) => {
  if (!val) return [];
  return Array.isArray(val) ? val.filter(Boolean) : [val].filter(Boolean);
};

const searchService = {

  // ===========================================================================
  // ACCOUNT SEARCH — Prospect Collection
  // Include/Exclude filters + various fields + pagination
  // ===========================================================================
  searchProspects: async (companyId, query) => {
    const {
      // Free text
      search,

      // Include/Exclude filters
      industryInclude,      industryExclude,
      countryInclude,       countryExclude,
      cityInclude,          cityExclude,
      businessModelInclude, businessModelExclude,
      employeesInclude,     employeesExclude,
      revenueInclude,       revenueExclude,
      salesPriorityInclude, salesPriorityExclude,
      clvRankingInclude,    clvRankingExclude,
      intentSignalInclude,  intentSignalExclude,
      historyTriggerInclude,historyTriggerExclude,
      servicePitchInclude,  servicePitchExclude,
      strategicValueInclude,strategicValueExclude,
      financialCapacityInclude, financialCapacityExclude,
      techAdoptionInclude,  techAdoptionExclude,
      infraRiskInclude,     infraRiskExclude,
      accountSourceInclude, accountSourceExclude,
      commercialCategoryInclude, commercialCategoryExclude,
      sourceInclude,        sourceExclude,

      // Range filter
      techFitScoreMin, techFitScoreMax,

      // Boolean filters
      isDuplicate,

      // Pagination + sort
      page      = 1,
      limit     = 10,
      sortBy    = "createdAt",
      sortOrder = "desc",
    } = query;

    const filter = companyFilter(companyId, {});

    // ── Free text search ─────────────────────────────────────────────────────
    if (search) {
      filter.$or = [
        { accountName:    { $regex: search, $options: "i" } },
        { website:        { $regex: search, $options: "i" } },
        { country:        { $regex: search, $options: "i" } },
        { hqLocationCity: { $regex: search, $options: "i" } },
      ];
    }

    // ── Include/Exclude filters ──────────────────────────────────────────────
    const applyFilter = (field, inc, exc) => {
      const f = buildIncExcFilter(inc, exc);
      if (f) filter[field] = f;
    };

    // Expand sector name → all mapped industry values before querying DB
    applyFilter("primaryIndustry", expandSectors(industryInclude), expandSectors(industryExclude));
    applyFilter("country",             countryInclude,           countryExclude);
    applyFilter("hqLocationCity",      cityInclude,              cityExclude);
    applyFilter("businessModel",       businessModelInclude,     businessModelExclude);
    applyFilter("noOfEmployees",       employeesInclude,         employeesExclude);
    applyFilter("annualRevenue",       revenueInclude,           revenueExclude);
    applyFilter("salesPriority",       salesPriorityInclude,     salesPriorityExclude);
    applyFilter("clvRanking",          clvRankingInclude,        clvRankingExclude);
    applyFilter("intentSignal",        intentSignalInclude,      intentSignalExclude);
    applyFilter("historyTrigger",      historyTriggerInclude,    historyTriggerExclude);
    applyFilter("servicePitch",        servicePitchInclude,      servicePitchExclude);
    applyFilter("strategicValue",      strategicValueInclude,    strategicValueExclude);
    applyFilter("financialCapacity",   financialCapacityInclude, financialCapacityExclude);
    applyFilter("techAdoptionProfile", techAdoptionInclude,      techAdoptionExclude);
    applyFilter("infrastructureRisk",  infraRiskInclude,         infraRiskExclude);
    applyFilter("accountSource",       accountSourceInclude,     accountSourceExclude);
    applyFilter("commercialCategory",  commercialCategoryInclude,commercialCategoryExclude);
    applyFilter("source",              sourceInclude,            sourceExclude);

    // ── TechFit Score range ──────────────────────────────────────────────────
    if (techFitScoreMin || techFitScoreMax) {
      filter.techFitScore = {};
      if (techFitScoreMin) filter.techFitScore.$gte = Number(techFitScoreMin);
      if (techFitScoreMax) filter.techFitScore.$lte = Number(techFitScoreMax);
    }

    // ── Boolean ──────────────────────────────────────────────────────────────
    if (isDuplicate !== undefined) {
      filter.isDuplicate = isDuplicate === "true";
    }

    // ── Pagination + sort ────────────────────────────────────────────────────
    const skip = (Number(page) - 1) * Number(limit);
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [prospects, total] = await Promise.all([
      Prospect.find(filter)
        .populate("assignedTo", "name email")
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Prospect.countDocuments(filter),
    ]);

    return {
      prospects,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  // ===========================================================================
  // CONTACT SEARCH — Contact Collection
  // Apollo style — contact fields plus denormalized account fields
  // Supports include/exclude filters
  // ===========================================================================
  searchContacts: async (companyId, query) => {
    const {
      // Free text
      search,

      // Contact level filters — Include/Exclude
      functionalDomainInclude, functionalDomainExclude,
      countryInclude,          countryExclude,
      stateInclude,            stateExclude,
      cityInclude,             cityExclude,

      // Boolean filters
      hasEmail,
      hasPhone,
      hasLinkedIn,
      isLinked,    // whether linked to an account

      // Account level filters (denormalized) — Include/Exclude
      accountIndustryInclude,      accountIndustryExclude,
      accountCountryInclude,       accountCountryExclude,
      accountCityInclude,          accountCityExclude,
      accountEmployeesInclude,     accountEmployeesExclude,
      accountRevenueInclude,       accountRevenueExclude,
      accountBusinessModelInclude, accountBusinessModelExclude,
      accountSalesPriorityInclude, accountSalesPriorityExclude,
      accountClvRankingInclude,    accountClvRankingExclude,
      accountIntentSignalInclude,  accountIntentSignalExclude,

      // TechFit Score range (account level)
      techFitScoreMin, techFitScoreMax,

      // Pagination + sort
      page      = 1,
      limit     = 10,
      sortBy    = "createdAt",
      sortOrder = "desc",
    } = query;

    const filter = companyFilter(companyId, {});

    // ── Free text search ─────────────────────────────────────────────────────
    if (search) {
      filter.$or = [
        { firstName:        { $regex: search, $options: "i" } },
        { lastName:         { $regex: search, $options: "i" } },
        { email:            { $regex: search, $options: "i" } },
        { standardizedRoles:{ $regex: search, $options: "i" } },
        { accountName:      { $regex: search, $options: "i" } },
      ];
    }

    // ── Helper ───────────────────────────────────────────────────────────────
    const applyFilter = (field, inc, exc) => {
      const f = buildIncExcFilter(inc, exc);
      if (f) filter[field] = f;
    };

    // ── Contact level filters ────────────────────────────────────────────────
    applyFilter("functionalDomain", functionalDomainInclude, functionalDomainExclude);
    applyFilter("country",          countryInclude,          countryExclude);
    applyFilter("state",            stateInclude,            stateExclude);
    applyFilter("city",             cityInclude,             cityExclude);

    // ── Account level filters (denormalized) ─────────────────────────────────
    // Expand sector name → all mapped industry values before querying DB
    applyFilter("accountIndustry", expandSectors(accountIndustryInclude), expandSectors(accountIndustryExclude));
    applyFilter("accountCountry",       accountCountryInclude,       accountCountryExclude);
    applyFilter("accountCity",          accountCityInclude,          accountCityExclude);
    applyFilter("accountEmployees",     accountEmployeesInclude,     accountEmployeesExclude);
    applyFilter("accountRevenue",       accountRevenueInclude,       accountRevenueExclude);
    applyFilter("accountBusinessModel", accountBusinessModelInclude, accountBusinessModelExclude);
    applyFilter("accountSalesPriority", accountSalesPriorityInclude, accountSalesPriorityExclude);
    applyFilter("accountClvRanking",    accountClvRankingInclude,    accountClvRankingExclude);
    applyFilter("accountIntentSignal",  accountIntentSignalInclude,  accountIntentSignalExclude);

    // ── TechFit Score range ──────────────────────────────────────────────────
    if (techFitScoreMin || techFitScoreMax) {
      filter.accountTechFitScore = {};
      if (techFitScoreMin) filter.accountTechFitScore.$gte = Number(techFitScoreMin);
      if (techFitScoreMax) filter.accountTechFitScore.$lte = Number(techFitScoreMax);
    }

    // ── Boolean filters ──────────────────────────────────────────────────────
    if (hasEmail   !== undefined) filter.hasEmail   = hasEmail   === "true";
    if (hasPhone   !== undefined) filter.hasPhone   = hasPhone   === "true";
    if (hasLinkedIn!== undefined) filter.hasLinkedIn= hasLinkedIn=== "true";
    if (isLinked   !== undefined) filter.isLinked   = isLinked   === "true";

    // ── Pagination + sort ────────────────────────────────────────────────────
    const skip = (Number(page) - 1) * Number(limit);
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [contacts, total] = await Promise.all([
      Contact.find(filter)
        .populate("accountId", "accountName website primaryIndustry country salesPriority")
        .populate("campaignIds", "name status")
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Contact.countDocuments(filter),
    ]);

    return {
      contacts,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  // ===========================================================================
  // FILTER OPTIONS — for frontend dropdowns
  // Unique values from both collections
  // ===========================================================================
  getFilterOptions: async (companyId) => {
    const prospectScope = companyFilter(companyId, {});
    const contactScope = companyFilter(companyId, {});
    const [
      // Account filters
      industries, countries, cities, businessModels,
      salesPriorities, clvRankings, intentSignals,
      employeeBands, revenueBands, historytriggers,
      servicePitches, strategicValues, financialCapacities,
      techAdoptions, infraRisks, accountSources,
      commercialCategories,

      // Contact filters
      functionalDomains, contactCountries,
    ] = await Promise.all([
      Prospect.distinct("primaryIndustry", prospectScope),
      Prospect.distinct("country", prospectScope),
      Prospect.distinct("hqLocationCity", prospectScope),
      Prospect.distinct("businessModel", prospectScope),
      Prospect.distinct("salesPriority", prospectScope),
      Prospect.distinct("clvRanking", prospectScope),
      Prospect.distinct("intentSignal", prospectScope),
      Prospect.distinct("noOfEmployees", prospectScope),
      Prospect.distinct("annualRevenue", prospectScope),
      Prospect.distinct("historyTrigger", prospectScope),
      Prospect.distinct("servicePitch", prospectScope),
      Prospect.distinct("strategicValue", prospectScope),
      Prospect.distinct("financialCapacity", prospectScope),
      Prospect.distinct("techAdoptionProfile", prospectScope),
      Prospect.distinct("infrastructureRisk", prospectScope),
      Prospect.distinct("accountSource", prospectScope),
      Prospect.distinct("commercialCategory", prospectScope),
      Contact.distinct("functionalDomain", contactScope),
      Contact.distinct("country", contactScope),
    ]);

    const clean = (arr) => arr.filter(Boolean).sort();

    return {
      // Account
      industries:          clean(industries),
      countries:           clean(countries),
      cities:              clean(cities),
      businessModels:      clean(businessModels),
      salesPriorities:     clean(salesPriorities),
      clvRankings:         clean(clvRankings),
      intentSignals:       clean(intentSignals),
      employeeBands:       clean(employeeBands),
      revenueBands:        clean(revenueBands),
      historyTriggers:     clean(historytriggers),
      servicePitches:      clean(servicePitches),
      strategicValues:     clean(strategicValues),
      financialCapacities: clean(financialCapacities),
      techAdoptions:       clean(techAdoptions),
      infraRisks:          clean(infraRisks),
      accountSources:      clean(accountSources),
      commercialCategories:clean(commercialCategories),

      // Contact
      functionalDomains:   clean(functionalDomains),
      contactCountries:    clean(contactCountries),
    };
  },

  globalSearch: async (companyId, query) => {
    if (!query || query.trim().length < 2) {
      return { accounts: [], segments: [], campaigns: [], contacts: [] };
    }

    const regex = new RegExp(escapeRegex(query), "i");
    const campaignCreators = await companyUserIds(companyId);

    const [accounts, segments, campaigns, contacts] = await Promise.all([
      Prospect.find(
        companyFilter(companyId, {
          $or: [{ accountName: regex }, { website: regex }],
        })
      )
        .select("accountName website primaryIndustry clvRanking")
        .limit(RESULT_LIMIT_PER_TYPE)
        .lean(),

      Segment.find(companyFilter(companyId, { name: regex }))
        .select("name matchCount matchedAccountIds")
        .limit(RESULT_LIMIT_PER_TYPE)
        .lean(),

      Campaign.find({
        createdBy: { $in: campaignCreators },
        name: regex,
      })
        .select("name status")
        .limit(RESULT_LIMIT_PER_TYPE)
        .lean(),

      Contact.find(
        companyFilter(companyId, {
          $or: [
            { firstName: regex },
            { lastName: regex },
            { email: regex },
            { accountName: regex },
            { standardizedRoles: regex },
          ],
        })
      )
        .select("firstName lastName email standardizedRoles accountName accountId")
        .limit(RESULT_LIMIT_PER_TYPE)
        .lean(),
    ]);

    return {
      accounts: accounts.map((a) => ({
        id: a._id,
        type: "account",
        title: a.accountName,
        subtitle: a.website || a.primaryIndustry || "",
        badge: a.clvRanking || null,
      })),
      segments: segments.map((s) => ({
        id: s._id,
        type: "segment",
        title: s.name,
        subtitle: `${s.matchCount ?? s.matchedAccountIds?.length ?? 0} accounts`,
      })),
      campaigns: campaigns.map((c) => ({
        id: c._id,
        type: "campaign",
        title: c.name,
        subtitle: c.status || "",
      })),
      contacts: contacts.map((c) => ({
        id: c._id,
        type: "contact",
        title: contactDisplayName(c),
        subtitle: c.standardizedRoles
          ? `${c.standardizedRoles} at ${c.accountName || "Unknown"}`
          : c.accountName || c.email || "",
        accountId: c.accountId ? String(c.accountId) : null,
      })),
    };
  },
};

export default searchService;