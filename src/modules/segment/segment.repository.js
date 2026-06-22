import Segment from "./segment.model.js";

const scopedFilter = (id, companyId) =>
  companyId ? { _id: id, companyId } : { _id: id };

const segmentRepository = {

  create: async (data) => {
    return await Segment.create(data);
  },

  findAll: async (userId, companyId) => {
    const filter = {
      $or: [{ createdBy: userId }, { isShared: true }],
    };
    if (companyId) filter.companyId = companyId;

    return await Segment.find(filter)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });
  },

  findById: async (id, companyId) => {
    return await Segment.findOne(scopedFilter(id, companyId))
      .populate("createdBy", "name email");
  },

  update: async (id, data, companyId) => {
    return await Segment.findOneAndUpdate(scopedFilter(id, companyId), data, { new: true });
  },

  delete: async (id, companyId) => {
    return await Segment.findOneAndDelete(scopedFilter(id, companyId));
  },

  saveSnapshot: async (id, matchedIds, companyId) => {
    return await Segment.findOneAndUpdate(
      scopedFilter(id, companyId),
      {
        matchedAccountIds: matchedIds,
        matchCount:        matchedIds.length,
        lastSyncedAt:      new Date(),
      },
      { new: true }
    );
  },
};

export default segmentRepository;
