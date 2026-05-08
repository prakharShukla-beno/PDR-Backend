import campaignRepository from "./campaign.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";

const campaignService = {

  // Create new campaign with prospect list
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

    if (data.prospectIds && data.prospectIds.length > 0) {
      for (const prospectId of data.prospectIds) {
        await prospectRepository.addCampaign(prospectId, campaign._id);
      }
    }

    return campaign;
  },

  // Get all campaigns
  getAll: async (query) => {
    const { page = 1, limit = 10 } = query;

    const { campaigns, total } = await campaignRepository.findAll({
      page: Number(page),
      limit: Number(limit),
    });

    return {
      campaigns,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  // Get single campaign
  getById: async (id) => {
    const campaign = await campaignRepository.findById(id);

    if (!campaign) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    return campaign;
  },

  // Update campaign name, description, status
  update: async (id, data) => {
    const exists = await campaignRepository.findById(id);

    if (!exists) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    return await campaignRepository.update(id, data);
  },

  
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
};

export default campaignService;