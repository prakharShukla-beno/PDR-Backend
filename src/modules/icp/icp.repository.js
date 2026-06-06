import ICP from "./icp.model.js";

const icpRepository = {

  // Create a new ICP profile
  create: async (data) => {
    return await ICP.create(data);
  },

  // Fetch all ICP profiles
  findAll: async ({ page = 1, limit = 10, isActive }) => {
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const skip = (page - 1) * limit;

    const [profiles, total] = await Promise.all([
      ICP.find(filter)
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      ICP.countDocuments(filter),
    ]);

    return { profiles, total };
  },

  // Single ICP profile by ID
  findById: async (id) => {
    return await ICP.findById(id).populate("createdBy", "name email");
  },

  // Update an ICP profile
  update: async (id, data) => {
    return await ICP.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
  },

  // Delete an ICP profile
  delete: async (id) => {
    return await ICP.findByIdAndDelete(id);
  },
};

export default icpRepository;