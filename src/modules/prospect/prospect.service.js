import prospectRepository from "./prospect.repository.js";
import duplicateRepository from "../duplicate/duplicate.repository.js";

const prospectService = {

  // Create prospect with duplicate detection
  create: async (data, userId) => {

    // Check for existing duplicates using accountName and website
    const existing = await prospectRepository.findDuplicates({
      accountName: data.accountName,
      website: data.website,
    });

    const isDuplicate = existing.length > 0;

    // Create the prospect record
    const prospect = await prospectRepository.create({
      ...data,
      isDuplicate,
      source: data.source || "excel",
    });

    // If duplicate found, log the pair in duplicates collection
    if (isDuplicate) {
      const matchFields = [];
      if (data.accountName) matchFields.push("accountName");
      if (data.website) matchFields.push("website");

      await duplicateRepository.create({
        prospectId1: existing[0]._id,
        prospectId2: prospect._id,
        matchFields,
        status: "pending",
      });
    }

    return { prospect, isDuplicate };
  },

  // Get all prospects with filters and pagination
  getAll: async (query) => {
    const {
      page = 1,
      limit = 10,
      search,
      primaryIndustry,
      country,
      salesPriority,
      isDuplicate,
      clvRanking,
      businessModel,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    const filter = {};

    // Text search across key fields
    if (search) {
      filter.$or = [
        { accountName: { $regex: search, $options: "i" } },
        { website: { $regex: search, $options: "i" } },
        { country: { $regex: search, $options: "i" } },
        { "contacts.email": { $regex: search, $options: "i" } },
        { "contacts.name": { $regex: search, $options: "i" } },
      ];
    }

    // Apply filters if provided
    if (primaryIndustry) filter.primaryIndustry = primaryIndustry;
    if (country) filter.country = { $regex: country, $options: "i" };
    if (salesPriority) filter.salesPriority = salesPriority;
    if (clvRanking) filter.clvRanking = clvRanking;
    if (businessModel) filter.businessModel = businessModel;
    if (isDuplicate !== undefined) filter.isDuplicate = isDuplicate === "true";

    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const { prospects, total } = await prospectRepository.findAll({
      filter,
      page: Number(page),
      limit: Number(limit),
      sort,
    });

    return {
      prospects,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  // Get single prospect by ID
  getById: async (id) => {
    const prospect = await prospectRepository.findById(id);

    if (!prospect) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }

    return prospect;
  },

  // Update prospect
  update: async (id, data) => {
    const exists = await prospectRepository.findById(id);

    if (!exists) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }

    return await prospectRepository.update(id, data);
  },

  // Delete prospect
  delete: async (id) => {
    const exists = await prospectRepository.findById(id);

    if (!exists) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }

    await prospectRepository.delete(id);
    return { message: "Prospect deleted successfully" };
  },
};

export default prospectService;