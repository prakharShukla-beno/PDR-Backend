import ICP from "./icp.model.js";

const icpRepository = {

  // Naya ICP profile banao
  create: async (data) => {
    return await ICP.create(data);
  },

  // Saare ICP profiles fetch karo
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

  // ICP profile update karo
  update: async (id, data) => {
    return await ICP.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
  },

  // ICP profile delete karo
  delete: async (id) => {
    return await ICP.findByIdAndDelete(id);
  },
};

export default icpRepository;