import contactRepository from "./contact.repository.js";
import Prospect from "../prospect/prospect.model.js";
import campaignRepository from "../campaign/campaign.repository.js";

const contactService = {

  // Create single contact manually
  create: async (data) => {
    let accountId = data.accountId || null;
    let isLinked  = false;

    // accountId diya hai → directly use karo
    if (accountId) {
      isLinked = true;
    }
    // accountName diya hai → DB mein dhundo
    else if (data.accountName) {
      const account = await Prospect.findOne({
        accountName: { $regex: new RegExp(`^${data.accountName.trim()}$`, "i") },
      });
      if (account) {
        accountId = account._id;
        isLinked  = true;
      }
    }

    return await contactRepository.create({
      ...data,
      accountId,
      isLinked,
      source: data.source || "manual",
    });
  },

  // Get all contacts with filters + pagination
  getAll: async (query) => {
    const {
      page  = 1, limit = 10, search,
      accountId, functionalDomain, country,
      isPrimary, isLinked,
      sortBy = "createdAt", sortOrder = "desc",
    } = query;

    const filter = {};
    if (search) {
      filter.$or = [
        { firstName:         { $regex: search, $options: "i" } },
        { lastName:          { $regex: search, $options: "i" } },
        { email:             { $regex: search, $options: "i" } },
        { accountName:       { $regex: search, $options: "i" } },
        { standardizedRoles: { $regex: search, $options: "i" } },
      ];
    }
    if (accountId)        filter.accountId        = accountId;
    if (functionalDomain) filter.functionalDomain = functionalDomain;
    if (country)          filter.country          = { $regex: country, $options: "i" };
    if (isPrimary !== undefined) filter.isPrimary = isPrimary === "true";
    if (isLinked  !== undefined) filter.isLinked  = isLinked  === "true";

    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const { contacts, total } = await contactRepository.findAll({
      filter, page: Number(page), limit: Number(limit), sort,
    });

    return {
      contacts,
      pagination: {
        total, page: Number(page), limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  getById: async (id) => {
    const contact = await contactRepository.findById(id);
    if (!contact) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }
    return contact;
  },

  getByAccountId: async (accountId) => {
    return await contactRepository.findByAccountId(accountId);
  },

  update: async (id, data) => {
    const exists = await contactRepository.findById(id);
    if (!exists) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }
    return await contactRepository.update(id, data);
  },

  delete: async (id) => {
    const exists = await contactRepository.findById(id);
    if (!exists) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }
    await contactRepository.delete(id);
    return { message: "Contact deleted successfully" };
  },

  // Unlinked contacts ko account se link karo
  // Jab account import ho tab call karo
  linkContactsToAccount: async (accountName, accountId) => {
    const result = await contactRepository.update(
      { accountName: { $regex: new RegExp(`^${accountName}$`, "i") }, isLinked: false },
      { $set: { accountId, isLinked: true } },
      { multi: true }
    );
    return result;
  },

  addToCampaign: async (contactId, campaignId) => {
    const contact = await contactRepository.findById(contactId);
    if (!contact) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }
    const campaign = await campaignRepository.findById(campaignId);
    if (!campaign) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }
    return await contactRepository.addCampaign(contactId, campaignId);
  },

  removeFromCampaign: async (contactId, campaignId) => {
    const contact = await contactRepository.findById(contactId);
    if (!contact) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }
    return await contactRepository.removeCampaign(contactId, campaignId);
  },
};

export default contactService;
