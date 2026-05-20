import contactRepository from "./contact.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";
import campaignRepository from "../campaign/campaign.repository.js";

const contactService = {

  // Create single contact manually
  create: async (data) => {
    // Account exist karta hai?
    const account = await prospectRepository.findById(data.accountId);
    if (!account) {
      const error = new Error("Account not found. Pehle account create karo.");
      error.statusCode = 404;
      throw error;
    }

    return await contactRepository.create({
      ...data,
      source: data.source || "manual",
    });
  },

  // Get all contacts with filters + pagination
  getAll: async (query) => {
    const {
      page  = 1,
      limit = 10,
      search,
      accountId,
      functionalDomain,
      country,
      isPrimary,
      sortBy    = "createdAt",
      sortOrder = "desc",
    } = query;

    const filter = {};

    if (search) {
      filter.$or = [
        { firstName:       { $regex: search, $options: "i" } },
        { lastName:        { $regex: search, $options: "i" } },
        { email:           { $regex: search, $options: "i" } },
        { standardizedRoles: { $regex: search, $options: "i" } },
      ];
    }

    if (accountId)        filter.accountId        = accountId;
    if (functionalDomain) filter.functionalDomain = functionalDomain;
    if (country)          filter.country          = { $regex: country, $options: "i" };
    if (isPrimary !== undefined) filter.isPrimary = isPrimary === "true";

    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const { contacts, total } = await contactRepository.findAll({
      filter,
      page:  Number(page),
      limit: Number(limit),
      sort,
    });

    return {
      contacts,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  // Get single contact
  getById: async (id) => {
    const contact = await contactRepository.findById(id);
    if (!contact) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }
    return contact;
  },

  // Get all contacts of one account
  getByAccountId: async (accountId) => {
    const account = await prospectRepository.findById(accountId);
    if (!account) {
      const error = new Error("Account not found");
      error.statusCode = 404;
      throw error;
    }
    return await contactRepository.findByAccountId(accountId);
  },

  // Update contact
  update: async (id, data) => {
    const exists = await contactRepository.findById(id);
    if (!exists) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }
    return await contactRepository.update(id, data);
  },

  // Delete contact
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

  // Add contact to campaign
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

    const updated = await contactRepository.addCampaign(contactId, campaignId);
    return updated;
  },

  // Remove contact from campaign
  removeFromCampaign: async (contactId, campaignId) => {
    const contact = await contactRepository.findById(contactId);
    if (!contact) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }

    const updated = await contactRepository.removeCampaign(contactId, campaignId);
    return updated;
  },
};

export default contactService;