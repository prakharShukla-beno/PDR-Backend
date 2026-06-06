import Duplicate from "./duplicate.model.js";

const duplicateRepository = {

  create: async (data) => {
    return await Duplicate.create(data);
  },

  findAll: async ({ filter = {}, page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;

    const [duplicates, total] = await Promise.all([
      Duplicate.find(filter)
        .populate("prospectId1")  // refPath automatically populates as Prospect or Contact
        .populate("prospectId2")
        .populate("reviewedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Duplicate.countDocuments(filter),
    ]);

    return { duplicates, total };
  },

  findById: async (id) => {
    return await Duplicate.findById(id)
      .populate("prospectId1")
      .populate("prospectId2")
      .populate("reviewedBy", "name email");
  },

  update: async (id, data) => {
    return await Duplicate.findByIdAndUpdate(
      id,
      data,
      { new: true, runValidators: true }
    );
  },
};

export default duplicateRepository;