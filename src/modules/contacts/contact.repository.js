import Contact from "./contact.model.js";

const contactRepository = {

  // Create single contact
  create: async (data) => {
    return await Contact.create(data);
  },

  // Bulk insert — CSV/Excel import ke liye
  insertMany: async (rows) => {
    return await Contact.insertMany(rows, {
      ordered: false,
      rawResult: true,
    });
  },

  // Get all contacts with pagination + filters
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

  // Get single contact by ID
  findById: async (id) => {
    return await Contact.findById(id)
      .populate("accountId", "accountName website primaryIndustry country salesPriority")
      .populate("campaignIds", "name status")
      .populate("importLogId", "fileName status");
  },

  // Update contact
  update: async (id, data) => {
    return await Contact.findByIdAndUpdate(
      id,
      data,
      { new: true, runValidators: true }
    );
  },

  // Delete contact
  delete: async (id) => {
    return await Contact.findByIdAndDelete(id);
  },

  // Get all contacts of one account
  findByAccountId: async (accountId) => {
    return await Contact.find({ accountId })
      .populate("campaignIds", "name status")
      .sort({ isPrimary: -1, createdAt: -1 });
  },

  // Add campaign to contact
  addCampaign: async (contactId, campaignId) => {
    return await Contact.findByIdAndUpdate(
      contactId,
      { $addToSet: { campaignIds: campaignId } },
      { new: true }
    );
  },

  // Remove campaign from contact
  removeCampaign: async (contactId, campaignId) => {
    return await Contact.findByIdAndUpdate(
      contactId,
      { $pull: { campaignIds: campaignId } },
      { new: true }
    );
  },
};

export default contactRepository;