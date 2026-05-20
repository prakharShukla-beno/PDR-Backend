import Segment from "./segment.model.js";

const segmentRepository = {

  create: async (data) => {
    return await Segment.create(data);
  },

  findAll: async (userId) => {
    return await Segment.find({
      $or: [{ createdBy: userId }, { isShared: true }],
    })
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 });
  },

  findById: async (id) => {
    return await Segment.findById(id).populate("createdBy", "name email role");
  },

  update: async (id, data) => {
    return await Segment.findByIdAndUpdate(id, data, { new: true });
  },

  delete: async (id) => {
    return await Segment.findByIdAndDelete(id);
  },

  updateMatchCount: async (id, count) => {
    return await Segment.findByIdAndUpdate(id, { matchCount: count }, { new: true });
  },
};

export default segmentRepository;