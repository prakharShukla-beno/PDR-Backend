import Campaign from "./campaign.model.js";
import campaignRepository from "./campaign.repository.js";
import contactRepository from "../contacts/contact.repository.js";
import auditLogService from "../auditLog/auditLog.service.js";
import { companyUserIds, companyFilter } from "../../common/utils/tenantScope.js";

const campaignService = {

  // ── Create ───────────────────────────────────────────────────────────────────
  create: async (data, userId) => {
    const campaign = await campaignRepository.create({
      ...data,
      createdBy: userId,
      status:    data.status || "draft",
      contactIds: [],
    });

    await auditLogService.log({
      userId,
      action:      "CREATE",
      entity:      "Campaign",
      entityId:    campaign._id,
      description: `Campaign "${campaign.name}" created`,
    });

    return campaign;
  },

  // ── Get All ──────────────────────────────────────────────────────────────────
  getAll: async (query, companyId) => {
    const { page = 1, limit = 10 } = query;
    const createdByIds = await companyUserIds(companyId);
    const { campaigns, total } = await campaignRepository.findAll({
      page:  Number(page),
      limit: Number(limit),
      createdByIds,
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

  // ── Get By ID ────────────────────────────────────────────────────────────────
  getById: async (id) => {
    const campaign = await campaignRepository.findById(id);
    if (!campaign) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }
    return campaign;
  },

  // ── Update ───────────────────────────────────────────────────────────────────
  update: async (id, data, userId) => {
    const exists = await campaignRepository.findById(id);
    if (!exists) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }
    const updated = await campaignRepository.update(id, data);
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

  // ── Delete ───────────────────────────────────────────────────────────────────
  delete: async (id, userId, companyId) => {
    const exists = await campaignRepository.findById(id);
    if (!exists) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    // When a campaign is deleted, update the contacts' campaignIds too
    if (exists.contactIds?.length > 0) {
      await contactRepository.updateMany(
        companyFilter(companyId, { _id: { $in: exists.contactIds } }),
        { $pull: { campaignIds: id } }
      );
    }

    await campaignRepository.delete(id);
    await auditLogService.log({
      userId,
      action:      "DELETE",
      entity:      "Campaign",
      entityId:    id,
      description: `Campaign "${exists.name}" deleted`,
    });
    return { message: "Campaign deleted successfully" };
  },

  // ── Add Contacts — Apollo style ───────────────────────────────────────────────
  addContacts: async (campaignId, contactIds, userId, companyId) => {
    const campaign = await campaignRepository.findById(campaignId);
    if (!campaign) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    // Validate contacts exist
    const validContacts = await contactRepository.findAll({
      filter: companyFilter(companyId, { _id: { $in: contactIds } }),
      page: 1,
      limit: contactIds.length,
    });

    if (validContacts.contacts.length === 0) {
      const error = new Error("No valid contacts found");
      error.statusCode = 404;
      throw error;
    }

    const validIds = validContacts.contacts.map(c => c._id);

    // Add contacts to the campaign
    const updated = await campaignRepository.addContacts(campaignId, validIds);

    // Also add the campaign ID to the contacts' campaignIds
    await contactRepository.updateMany(
      companyFilter(companyId, { _id: { $in: validIds } }),
      { $addToSet: { campaignIds: campaignId } }
    );

    await auditLogService.log({
      userId,
      action:      "UPDATE",
      entity:      "Campaign",
      entityId:    campaignId,
      description: `${validIds.length} contacts added to campaign "${campaign.name}"`,
    });

    return updated;
  },

  // ── Remove Contact ────────────────────────────────────────────────────────────
  removeContact: async (campaignId, contactId, userId, companyId) => {
    const campaign = await campaignRepository.findById(campaignId);
    if (!campaign) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    await campaignRepository.removeContact(campaignId, contactId);

    // Also remove the campaign ID from the contact's campaignIds
    await contactRepository.update(contactId, {
      $pull: { campaignIds: campaignId },
    }, companyId);

    return { message: "Contact removed from campaign" };
  },

  // ── Update Stats — FR-9.3 ────────────────────────────────────────────────────
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