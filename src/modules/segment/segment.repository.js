import Segment from "./segment.model.js";

const segmentRepository = {

  // Create new segment
  create: async (data) => {
    return await Segment.create(data);
  },

  // Get all segments visible to user — own + shared
  findAll: async (userId) => {
    return await Segment.find({
      $or: [{ createdBy: userId }, { isShared: true }],
    })
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });
  },

  // Get single segment — populate account IDs for detail page
  findById: async (id) => {
    return await Segment.findById(id)
      .populate("createdBy", "name email");
  },

  // Update any segment fields
  update: async (id, data) => {
    return await Segment.findByIdAndUpdate(id, data, { new: true });
  },

  // Delete segment permanently
  delete: async (id) => {
    return await Segment.findByIdAndDelete(id);
  },

  // Save snapshot — store matched account IDs + count + sync time
  saveSnapshot: async (id, matchedIds) => {
    return await Segment.findByIdAndUpdate(
      id,
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