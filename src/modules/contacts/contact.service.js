import contactRepository from "./contact.repository.js";
import Contact          from "./contact.model.js";
import Prospect          from "../prospect/prospect.model.js";
import campaignRepository from "../campaign/campaign.repository.js";
import { companyFilter } from "../../common/utils/tenantScope.js";
import { dedupeContactsForAccount } from "../../common/utils/contactDedup.js";
import { resolveContactAccountLinks, resolveContactAccountLink } from "../../common/utils/resolveContactAccountLinks.js";

// Helper — extract denormalized account fields from a prospect
const extractAccountFields = (prospect) => ({
  accountIndustry:      prospect.primaryIndustry || null,
  accountCountry:       prospect.country          || null,
  accountCity:          prospect.hqLocationCity   || null,
  accountEmployees:     prospect.noOfEmployees    || null,
  accountRevenue:       prospect.annualRevenue    || null,
  accountBusinessModel: prospect.businessModel    || null,
  accountSalesPriority: prospect.salesPriority    || null,
  accountClvRanking:    prospect.clvRanking       || null,
  accountTechFitScore:  prospect.techFitScore     || null,
  accountIntentSignal:  prospect.intentSignal     || null,
  accountWebsite:       prospect.website          || null,
});

const contactService = {

  // Create single contact manually
  create: async (companyId, data) => {
    let accountId     = data.accountId || null;
    let isLinked      = false;
    let accountFields = {};

    if (accountId) {
      const prospect = await Prospect.findOne({ _id: accountId, companyId }).lean();
      if (prospect) {
        isLinked      = true;
        accountFields = extractAccountFields(prospect);
      }
    }
    // If accountName provided -> search in DB
    else if (data.accountName) {
      const prospect = await Prospect.findOne({
        companyId,
        accountName: { $regex: new RegExp(`^${data.accountName.trim()}$`, "i") },
      }).lean();

      if (prospect) {
        accountId     = prospect._id;
        isLinked      = true;
        accountFields = extractAccountFields(prospect);
      }
    }

    return await contactRepository.create({
      ...data,
      companyId,
      accountId,
      isLinked,
      ...accountFields,   // accountIndustry, accountCountry etc. will be set
      source: data.source || "manual",
    });
  },

  // Get all contacts with filters + pagination
  getAll: async (companyId, query) => {
    const {
      page  = 1, limit = 10, search,
      accountId, functionalDomain, country,
      isPrimary, isLinked,
      sortBy = "createdAt", sortOrder = "desc",
    } = query;

    const filter = companyFilter(companyId, {});
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

    const resolvedContacts = await resolveContactAccountLinks(contacts, companyId);

    return {
      contacts: resolvedContacts,
      pagination: {
        total, page: Number(page), limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  getById: async (id, companyId) => {
    const contact = await contactRepository.findById(id, companyId);
    if (!contact) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }
    return await resolveContactAccountLink(contact, companyId);
  },

  getByAccountId: async (accountId, companyId) => {
    const prospect = await Prospect.findOne({ _id: accountId, companyId }).lean();
    const prospectName = prospect?.accountName?.trim() || "";

    // Step 1: Get contacts directly linked by accountId
    // Step 2: Also find unlinked contacts whose accountName matches (case-insensitive contains)
    // Two separate queries — simple, reliable, no $expr tricks
    const byId = await Contact.find({ accountId, companyId })
      .populate("campaignIds", "name status")
      .sort({ isPrimary: -1, createdAt: -1 })
      .lean();

    let byName = [];
    if (prospectName) {
      // Get all contacts where accountName contains prospectName OR prospectName contains accountName
      const allUnlinked = await Contact.find({
        companyId,
        accountId: null,
        accountName: { $nin: [null, ""] },
      }).select("_id accountName").lean();

      const nameMatched = allUnlinked.filter(c => {
        const cName = (c.accountName || "").toLowerCase().trim();
        const pName = prospectName.toLowerCase();
        return cName.includes(pName) || pName.includes(cName);
      });

      if (nameMatched.length > 0) {
        byName = await Contact.find({
          _id: { $in: nameMatched.map(c => c._id) },
          companyId,
        })
          .populate("campaignIds", "name status")
          .sort({ isPrimary: -1, createdAt: -1 })
          .lean();
      }
    }

    // Merge — deduplicate by _id
    const seen = new Set(byId.map(c => c._id.toString()));
    const contacts = [...byId, ...byName.filter(c => !seen.has(c._id.toString()))];

    // Auto-link unlinked contacts found by name — background, non-blocking
    if (byName.length > 0 && prospect) {
      const accountFields = {
        accountId:            prospect._id,
        isLinked:             true,
        accountName:          prospect.accountName,
        accountIndustry:      prospect.primaryIndustry || null,
        accountCountry:       prospect.country         || null,
        accountCity:          prospect.hqLocationCity  || null,
        accountEmployees:     prospect.noOfEmployees   || null,
        accountRevenue:       prospect.annualRevenue   || null,
        accountBusinessModel: prospect.businessModel   || null,
        accountSalesPriority: prospect.salesPriority   || null,
        accountClvRanking:    prospect.clvRanking      || null,
        accountTechFitScore:  prospect.techFitScore    || null,
        accountIntentSignal:  prospect.intentSignal    || null,
        accountWebsite:       prospect.website         || null,
      };
      Contact.updateMany(
        { _id: { $in: byName.map(c => c._id) }, companyId },
        { $set: accountFields }
      ).catch(() => {});
    }

    return dedupeContactsForAccount(contacts);
  },

  update: async (id, data, companyId) => {
    const exists = await contactRepository.findById(id, companyId);
    if (!exists) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }
    return await contactRepository.update(id, data, companyId);
  },

  delete: async (id, companyId) => {
    const exists = await contactRepository.findById(id, companyId);
    if (!exists) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }
    await contactRepository.delete(id, companyId);
    return { message: "Contact deleted successfully" };
  },

  addToCampaign: async (contactId, campaignId, companyId) => {
    const contact = await contactRepository.findById(contactId, companyId);
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
    return await contactRepository.addCampaign(contactId, campaignId, companyId);
  },

  removeFromCampaign: async (contactId, campaignId, companyId) => {
    const contact = await contactRepository.findById(contactId, companyId);
    if (!contact) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }
    return await contactRepository.removeCampaign(contactId, campaignId, companyId);
  },

  linkToAccount: async (contactId, prospectId, companyId) => {
    const contact = await contactRepository.findById(contactId, companyId);
    if (!contact) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }

    const prospect = await Prospect.findOne({ _id: prospectId, companyId }).lean();
    if (!prospect) {
      const error = new Error("Account not found");
      error.statusCode = 404;
      throw error;
    }

    const accountFields = extractAccountFields(prospect);

    return await contactRepository.update(contactId, {
      accountId:   prospect._id,
      accountName: prospect.accountName,
      isLinked:    true,
      ...accountFields,
    }, companyId);
  },

  // Unlink a contact from its account — Apollo style
  // Contact record itself is NOT deleted, only the account association is cleared
  unlinkFromAccount: async (contactId, companyId) => {
    const contact = await contactRepository.findById(contactId, companyId);
    if (!contact) {
      const error = new Error("Contact not found");
      error.statusCode = 404;
      throw error;
    }

    return await contactRepository.update(contactId, {
      accountId:            null,
      accountName:          null,
      isLinked:             false,
      accountIndustry:      null,
      accountCountry:       null,
      accountCity:          null,
      accountEmployees:     null,
      accountRevenue:       null,
      accountBusinessModel: null,
      accountSalesPriority: null,
      accountClvRanking:    null,
      accountTechFitScore:  null,
      accountIntentSignal:  null,
      accountWebsite:       null,
    }, companyId);
  },

  bulkLinkByName: async (companyId) => {
    const unlinked = await contactRepository.findAll({
      filter: companyFilter(companyId, { isLinked: false, accountName: { $ne: null } }),
      page: 1, limit: 99999, sort: { createdAt: -1 },
    });

    let linked = 0, skipped = 0;

    for (const contact of unlinked.contacts) {
      if (!contact.accountName) { skipped++; continue; }

      const prospect = await Prospect.findOne({
        companyId,
        accountName: { $regex: new RegExp("^" + contact.accountName.trim() + "$", "i") },
      }).lean();

      if (prospect) {
        const accountFields = extractAccountFields(prospect);
        await contactRepository.update(contact._id, {
          accountId:   prospect._id,
          isLinked:    true,
          ...accountFields,
        }, companyId);
        linked++;
      } else {
        skipped++;
      }
    }

    return { linked, skipped, total: unlinked.contacts.length };
  },
};

export default contactService;