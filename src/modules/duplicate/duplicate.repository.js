import Duplicate from "./duplicate.model.js";

const duplicateRepository = {

  // Save a new duplicate pair
  create: async (data) => {
    return await Duplicate.create(data);
  },

  // Get all pending duplicates
  findAll: async ({ filter = {}, page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;

    const [duplicates, total] = await Promise.all([
      Duplicate.find(filter)
        .populate("prospectId1", "accountName website")
        .populate("prospectId2", "accountName website")
        .populate("reviewedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Duplicate.countDocuments(filter),
    ]);

    return { duplicates, total };
  },

  // Get single duplicate pair by ID
  findById: async (id) => {
    return await Duplicate.findById(id)
      .populate("prospectId1")
      .populate("prospectId2")
      .populate("reviewedBy", "name email");
  },

  // Update duplicate status (merged / dismissed)
  update: async (id, data) => {
    return await Duplicate.findByIdAndUpdate(
      id,
      data,
      { new: true, runValidators: true }
    );
  },
};

export default duplicateRepository;