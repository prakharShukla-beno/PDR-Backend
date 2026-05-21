import campaignRepository from "./campaign.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";
import Campaign from "./campaign.model.js";


const campaignService = {

  // Create new campaign — validate all prospectIds first
  create: async (data, userId) => {
    if (data.prospectIds && data.prospectIds.length > 0) {
      for (const prospectId of data.prospectIds) {
        const exists = await prospectRepository.findById(prospectId);
        if (!exists) {
          const error = new Error(`Prospect not found: ${prospectId}`);
          error.statusCode = 404;
          throw error;
        }
      }
    }

    const campaign = await campaignRepository.create({
      ...data,
      createdBy: userId,
      status: data.status || "draft",
    });

    // Link campaign to each prospect's campaignIds array
    if (data.prospectIds && data.prospectIds.length > 0) {
      for (const prospectId of data.prospectIds) {
        await prospectRepository.addCampaign(prospectId, campaign._id);
      }
    }

    return campaign;
  },

  // Get paginated list of all campaigns
  getAll: async (query) => {
    const { page = 1, limit = 10 } = query;

    const { campaigns, total } = await campaignRepository.findAll({
      page:  Number(page),
      limit: Number(limit),
    });

    return {
      campaigns,
      pagination: {
        total, page: Number(page), limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  // Get single campaign by ID
  getById: async (id) => {
    const campaign = await campaignRepository.findById(id);
    if (!campaign) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }
    return campaign;
  },

  // Update campaign fields
  update: async (id, data) => {
    const exists = await campaignRepository.findById(id);
    if (!exists) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }
    return await campaignRepository.update(id, data);
  },

  // Delete campaign and remove references from all linked prospects
  delete: async (id) => {
    const campaign = await campaignRepository.findById(id);
    if (!campaign) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    for (const prospectId of campaign.prospectIds) {
      await prospectRepository.update(prospectId, {
        $pull: { campaignIds: campaign._id },
      });
    }

    await campaignRepository.delete(id);
    return { message: "Campaign deleted successfully" };
  },

  // Add prospects to campaign — validates each before adding
  addProspects: async (id, prospectIds) => {
    const campaign = await campaignRepository.findById(id);
    if (!campaign) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    for (const prospectId of prospectIds) {
      const exists = await prospectRepository.findById(prospectId);
      if (!exists) {
        const error = new Error(`Prospect not found: ${prospectId}`);
        error.statusCode = 404;
        throw error;
      }
    }

    const updated = await campaignRepository.addProspects(id, prospectIds);

    for (const prospectId of prospectIds) {
      await prospectRepository.addCampaign(prospectId, id);
    }

    return updated;
  },

  // Remove one prospect from campaign
  removeProspect: async (id, prospectId) => {
    const campaign = await campaignRepository.findById(id);
    if (!campaign) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    const updated = await campaignRepository.removeProspect(id, prospectId);

    await prospectRepository.update(prospectId, {
      $pull: { campaignIds: campaign._id },
    });

    return updated;
  },

  // Update campaign performance stats — FR-9.3
  // Only updates the fields that are provided
  updateStats: async (id, stats) => {
    const updateData = {};
    if (stats.sentCount   !== undefined) updateData["stats.sentCount"]   = stats.sentCount;
    if (stats.openCount   !== undefined) updateData["stats.openCount"]   = stats.openCount;
    if (stats.clickCount  !== undefined) updateData["stats.clickCount"]  = stats.clickCount;
    if (stats.replyCount  !== undefined) updateData["stats.replyCount"]  = stats.replyCount;
    if (stats.conversions !== undefined) updateData["stats.conversions"] = stats.conversions;

    return await Campaign.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
  },
};

export default campaignService;