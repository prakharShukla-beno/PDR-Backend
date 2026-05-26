import Campaign from "./campaign.model.js";                    // ← FIX: missing import
import campaignRepository from "./campaign.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";
import auditLogService from "../auditLog/auditLog.service.js"; // ← ADD: audit log

const campaignService = {

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

    // ── Audit log ──────────────────────────────────────────────────────────
    await auditLogService.log({
      userId,
      action:      "CREATE",
      entity:      "Campaign",
      entityId:    campaign._id,
      description: `Campaign "${campaign.name}" created`,
    });

    return campaign;
  },

  getAll: async (query) => {
    const { page = 1, limit = 10 } = query;
    const { campaigns, total } = await campaignRepository.findAll({
      page:  Number(page),
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

  getById: async (id) => {
    const campaign = await campaignRepository.findById(id);
    if (!campaign) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }
    return campaign;
  },

  update: async (id, data, userId) => {
    const exists = await campaignRepository.findById(id);
    if (!exists) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    const updated = await campaignRepository.update(id, data);

    // ── Audit log ──────────────────────────────────────────────────────────
    await auditLogService.log({
      userId,
      action:      "UPDATE",
      entity:      "Campaign",
      entityId:    id,
      description: `Campaign "${exists.name}" updated`,
      metadata:    { changes: Object.keys(data) },
    });

    return updated;
  },

  delete: async (id, userId) => {
    const exists = await campaignRepository.findById(id);
    if (!exists) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    await campaignRepository.delete(id);

    // ── Audit log ──────────────────────────────────────────────────────────
    await auditLogService.log({
      userId,
      action:      "DELETE",
      entity:      "Campaign",
      entityId:    id,
      description: `Campaign "${exists.name}" deleted`,
    });

    return { message: "Campaign deleted successfully" };
  },

  addProspect: async (campaignId, prospectId, userId) => {
    const campaign = await campaignRepository.findById(campaignId);
    if (!campaign) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }
    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }

    await campaignRepository.addProspect(campaignId, prospectId);
    await prospectRepository.addCampaign(prospectId, campaignId);

    return campaign;
  },

  removeProspect: async (campaignId, prospectId, userId) => {
    await campaignRepository.removeProspect(campaignId, prospectId);
    await prospectRepository.removeCampaign(prospectId, campaignId);
    return { message: "Prospect removed from campaign" };
  },

  // ── FR-9.3 FIX: updateStats — Campaign import add kiya ──────────────────
  updateStats: async (id, stats) => {
    const updateData = {};
    if (stats.sentCount   !== undefined) updateData["stats.sentCount"]   = stats.sentCount;
    if (stats.openCount   !== undefined) updateData["stats.openCount"]   = stats.openCount;
    if (stats.clickCount  !== undefined) updateData["stats.clickCount"]  = stats.clickCount;
    if (stats.replyCount  !== undefined) updateData["stats.replyCount"]  = stats.replyCount;
    if (stats.conversions !== undefined) updateData["stats.conversions"] = stats.conversions;

    // Campaign import fix — ab crash nahi karega
    return await Campaign.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
  },
};

export default campaignService;