import Prospect from "./prospect.model.js";

const prospectRepository = {

  // Save new prospect to DB
  create: async (data) => {
    return await Prospect.create(data);
  },

  // Get all prospects with pagination and filters
  findAll: async ({ filter = {}, page = 1, limit = 10, sort = { createdAt: -1 } }) => {
    const skip = (page - 1) * limit;

    const [prospects, total] = await Promise.all([
      Prospect.find(filter)
        .populate("assignedTo", "name email")
        .populate("importLogId", "fileName status")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Prospect.countDocuments(filter),
    ]);

    return { prospects, total };
  },

  // Get single prospect by ID
  findById: async (id) => {
    return await Prospect.findById(id)
      .populate("assignedTo", "name email")
      .populate("importLogId", "fileName status importType")
      .populate("campaignIds", "name status")
      .populate("interactionIds", "type outcome interactedAt");
  },

  // Update prospect fields
  update: async (id, data) => {
    return await Prospect.findByIdAndUpdate(
      id,
      data,
      { new: true, runValidators: true }
    );
  },

  // Permanently delete prospect
  delete: async (id) => {
    return await Prospect.findByIdAndDelete(id);
  },

  // Check duplicates by accountName or website
  findDuplicates: async ({ accountName, website }) => {
    const conditions = [];

    if (accountName) {
      conditions.push({
        accountName: { $regex: new RegExp(`^${accountName}$`, "i") },
      });
    }

    if (website) {
      conditions.push({
        website: website.toLowerCase().trim(),
      });
    }

    if (conditions.length === 0) return [];

    return await Prospect.find({ $or: conditions }).select(
      "accountName website isDuplicate"
    );
  },

  // Add campaignId to prospect's campaignIds array
  addCampaign: async (prospectId, campaignId) => {
    return await Prospect.findByIdAndUpdate(
      prospectId,
      { $addToSet: { campaignIds: campaignId } },
      { new: true }
    );
  },

  // Add interactionId to prospect's interactionIds array
  addInteraction: async (prospectId, interactionId) => {
    return await Prospect.findByIdAndUpdate(
      prospectId,
      { $addToSet: { interactionIds: interactionId } },
      { new: true }
    );
  },
};

export default prospectRepository;