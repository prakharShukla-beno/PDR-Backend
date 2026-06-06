import Campaign from "./campaign.model.js";

const campaignRepository = {

  create: async (data) => {
    return await Campaign.create(data);
  },

  findAll: async ({ page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;
    const [campaigns, total] = await Promise.all([
      Campaign.find()
        .populate("createdBy", "name email")
        .populate({
          path: "contactIds",
          select: "firstName lastName email standardizedRoles functionalDomain accountId accountName accountIndustry accountCountry hasPhone hasEmail linkedIn",
          populate: {
            path: "accountId",
            select: "accountName primaryIndustry country salesPriority techFitScore",
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Campaign.countDocuments(),
    ]);
    return { campaigns, total };
  },

  findById: async (id) => {
    return await Campaign.findById(id)
      .populate("createdBy", "name email")
      .populate({
        path: "contactIds",
        select: "firstName lastName email standardizedRoles functionalDomain accountId accountName accountIndustry accountCountry primaryPhone primaryMobNo linkedIn hasPhone hasEmail isPrimary",
        populate: {
          path: "accountId",
          select: "accountName primaryIndustry country salesPriority techFitScore clvRanking intentSignal",
        },
      });
  },

  update: async (id, data) => {
    return await Campaign.findByIdAndUpdate(id, data, {
      new: true, runValidators: true,
    });
  },

  delete: async (id) => {
    return await Campaign.findByIdAndDelete(id);
  },

  // Add contacts to campaign
  addContacts: async (id, contactIds) => {
    return await Campaign.findByIdAndUpdate(
      id,
      { $addToSet: { contactIds: { $each: contactIds } } },
      { new: true }
    );
  },

  // Remove contact from campaign
  removeContact: async (id, contactId) => {
    return await Campaign.findByIdAndUpdate(
      id,
      { $pull: { contactIds: contactId } },
      { new: true }
    );
  },
};

export default campaignRepository;