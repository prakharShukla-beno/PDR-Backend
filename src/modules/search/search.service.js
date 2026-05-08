import Prospect from "../prospect/prospect.model.js";

const searchService = {

  // Main search function — filters + pagination + sorting
  searchProspects: async (query) => {
    const {
      search,           // Free text search
      primaryIndustry,  // Filter by industry
      country,          // Filter by country
      businessModel,    // Filter by B2B/B2C etc
      salesPriority,    // Filter by P1/P2/P3/P4
      clvRanking,       // Filter by Tier-A/B/C
      intentSignal,     // Filter by intent
      noOfEmployees,    // Filter by employee band
      annualRevenue,    // Filter by revenue band
      isDuplicate,      // Filter duplicates only
      techFitScoreMin,  // Min tech fit score
      techFitScoreMax,  // Max tech fit score
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    const filter = {};

    // Free text search — accountName, website, country, contact fields
    if (search) {
      filter.$or = [
        { accountName:        { $regex: search, $options: "i" } },
        { website:            { $regex: search, $options: "i" } },
        { country:            { $regex: search, $options: "i" } },
        { hqLocationCity:     { $regex: search, $options: "i" } },
        { "contacts.name":    { $regex: search, $options: "i" } },
        { "contacts.email":   { $regex: search, $options: "i" } },
      ];
    }

    // Exact enum filters
    if (primaryIndustry) filter.primaryIndustry = primaryIndustry;
    if (businessModel)   filter.businessModel   = businessModel;
    if (salesPriority)   filter.salesPriority   = salesPriority;
    if (clvRanking)      filter.clvRanking       = clvRanking;
    if (intentSignal)    filter.intentSignal     = intentSignal;
    if (noOfEmployees)   filter.noOfEmployees    = noOfEmployees;
    if (annualRevenue)   filter.annualRevenue     = annualRevenue;

    // Partial match for country
    if (country) filter.country = { $regex: country, $options: "i" };

    // Boolean filter
    if (isDuplicate !== undefined) {
      filter.isDuplicate = isDuplicate === "true";
    }

    // Range filter for techFitScore
    if (techFitScoreMin || techFitScoreMax) {
      filter.techFitScore = {};
      if (techFitScoreMin) filter.techFitScore.$gte = Number(techFitScoreMin);
      if (techFitScoreMax) filter.techFitScore.$lte = Number(techFitScoreMax);
    }

    const skip = (page - 1) * limit;
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

  // Get unique filter options from DB — frontend dropdown ke liye
  getFilterOptions: async () => {
    const [
      industries,
      countries,
      businessModels,
      salesPriorities,
      clvRankings,
      intentSignals,
      employeeBands,
      revenueBands,
    ] = await Promise.all([
      Prospect.distinct("primaryIndustry"),
      Prospect.distinct("country"),
      Prospect.distinct("businessModel"),
      Prospect.distinct("salesPriority"),
      Prospect.distinct("clvRanking"),
      Prospect.distinct("intentSignal"),
      Prospect.distinct("noOfEmployees"),
      Prospect.distinct("annualRevenue"),
    ]);

    // null values filter out karo
    return {
      industries:     industries.filter(Boolean),
      countries:      countries.filter(Boolean),
      businessModels: businessModels.filter(Boolean),
      salesPriorities:salesPriorities.filter(Boolean),
      clvRankings:    clvRankings.filter(Boolean),
      intentSignals:  intentSignals.filter(Boolean),
      employeeBands:  employeeBands.filter(Boolean),
      revenueBands:   revenueBands.filter(Boolean),
    };
  },
};

export default searchService;