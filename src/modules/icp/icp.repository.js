import ICP from "./icp.model.js";

const scopedFilter = (id, companyId) =>
  companyId ? { _id: id, companyId } : { _id: id };

const icpRepository = {

  create: async (data) => {
    return await ICP.create(data);
  },

  findAll: async ({ page = 1, limit = 10, isActive, companyId }) => {
    const filter = {};
    if (companyId) filter.companyId = companyId;
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

  findById: async (id, companyId) => {
    return await ICP.findOne(scopedFilter(id, companyId)).populate("createdBy", "name email");
  },

  update: async (id, data, companyId) => {
    return await ICP.findOneAndUpdate(scopedFilter(id, companyId), data, {
      new: true,
      runValidators: true,
    });
  },

  delete: async (id, companyId) => {
    return await ICP.findOneAndDelete(scopedFilter(id, companyId));
  },
};

export default icpRepository;
