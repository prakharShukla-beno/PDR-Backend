import Campaign from "./campaign.model.js";

const campaignRepository = {

  // Save new campaign to DB
  create: async (data) => {
    return await Campaign.create(data);
  },

  // Get all campaigns with pagination
  findAll: async ({ page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;

    const [campaigns, total] = await Promise.all([
      Campaign.find()
        .populate("createdBy", "name email")
        .populate("prospectIds", "accountName website country primaryIndustry salesPriority")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Campaign.countDocuments(),
    ]);

    return { campaigns, total };
  },

  // Get single campaign by ID with full prospect details
  findById: async (id) => {
    return await Campaign.findById(id)
      .populate("createdBy", "name email")
      .populate("prospectIds", "accountName website country primaryIndustry salesPriority clvRanking intentSignal contacts");
  },

  // Update campaign
  update: async (id, data) => {
    return await Campaign.findByIdAndUpdate(
      id,
      data,
      { new: true, runValidators: true }
    );
  },

  // Delete campaign
  delete: async (id) => {
    return await Campaign.findByIdAndDelete(id);
  },

  // Add prospects to existing campaign
  addProspects: async (id, prospectIds) => {
    return await Campaign.findByIdAndUpdate(
      id,
      { $addToSet: { prospectIds: { $each: prospectIds } } },
      { new: true }
    );
  },

  // Remove prospect from campaign
  removeProspect: async (id, prospectId) => {
    return await Campaign.findByIdAndUpdate(
      id,
      { $pull: { prospectIds: prospectId } },
      { new: true }
    );
  },
};

export default campaignRepository;