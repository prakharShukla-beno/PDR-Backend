import Contact from "./contact.model.js";

const contactRepository = {

  create: async (data) => {
    return await Contact.create(data);
  },

  insertMany: async (rows) => {
    return await Contact.insertMany(rows, {
      ordered:   false,
      rawResult: true,
    });
  },

  findAll: async ({ filter = {}, page = 1, limit = 10, sort = { createdAt: -1 } }) => {
    const skip = (page - 1) * limit;
    const [contacts, total] = await Promise.all([
      Contact.find(filter)
        .populate("accountId", "accountName website primaryIndustry country")
        .populate("campaignIds", "name status")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Contact.countDocuments(filter),
    ]);
    return { contacts, total };
  },

  findById: async (id) => {
    return await Contact.findById(id)
      .populate("accountId", "accountName website primaryIndustry country salesPriority")
      .populate("campaignIds", "name status")
      .populate("importLogId", "fileName status");
  },

  update: async (id, data) => {
    return await Contact.findByIdAndUpdate(id, data, {
      new: true, runValidators: true,
    });
  },

  // ── Bulk update — auto-link ke liye ADD kiya ──────────────────────────────
  updateMany: async (filter, update) => {
    return await Contact.updateMany(filter, update);
  },

  delete: async (id) => {
    return await Contact.findByIdAndDelete(id);
  },

  findByAccountId: async (accountId) => {
    return await Contact.find({ accountId })
      .populate("campaignIds", "name status")
      .sort({ isPrimary: -1, createdAt: -1 });
  },

  countByAccountId: async (accountId) => {
    return await Contact.countDocuments({ accountId });
  },

  addCampaign: async (contactId, campaignId) => {
    return await Contact.findByIdAndUpdate(
      contactId,
      { $addToSet: { campaignIds: campaignId } },
      { new: true }
    );
  },

  removeCampaign: async (contactId, campaignId) => {
    return await Contact.findByIdAndUpdate(
      contactId,
      { $pull: { campaignIds: campaignId } },
      { new: true }
    );
  },
};

export default contactRepository;