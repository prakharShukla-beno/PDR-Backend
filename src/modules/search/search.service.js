import Prospect from "../prospect/prospect.model.js";
import Contact from "../contacts/contact.model.js";

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
  searchProspects: async (query) => {
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

    const filter = {};

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

    applyFilter("primaryIndustry",     industryInclude,          industryExclude);
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
  searchContacts: async (query) => {
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

    const filter = {};

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
    applyFilter("accountIndustry",      accountIndustryInclude,      accountIndustryExclude);
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
  getFilterOptions: async () => {
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
      Prospect.distinct("primaryIndustry"),
      Prospect.distinct("country"),
      Prospect.distinct("hqLocationCity"),
      Prospect.distinct("businessModel"),
      Prospect.distinct("salesPriority"),
      Prospect.distinct("clvRanking"),
      Prospect.distinct("intentSignal"),
      Prospect.distinct("noOfEmployees"),
      Prospect.distinct("annualRevenue"),
      Prospect.distinct("historyTrigger"),
      Prospect.distinct("servicePitch"),
      Prospect.distinct("strategicValue"),
      Prospect.distinct("financialCapacity"),
      Prospect.distinct("techAdoptionProfile"),
      Prospect.distinct("infrastructureRisk"),
      Prospect.distinct("accountSource"),
      Prospect.distinct("commercialCategory"),
      Contact.distinct("functionalDomain"),
      Contact.distinct("country"),
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
};

export default searchService;