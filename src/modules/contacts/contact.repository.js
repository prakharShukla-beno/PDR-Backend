import Contact from "./contact.model.js";
import { companyObjectId, requireCompanyId } from "../../common/utils/tenantScope.js";

const scopedFilter = (id, companyId) => ({
  _id: id,
  companyId: companyObjectId(requireCompanyId(companyId)),
});

const assertCompanyScoped = (filter) => {
  if (filter?.companyId == null) {
    const error = new Error("Contact query requires companyId scope");
    error.statusCode = 500;
    throw error;
  }
};

const contactRepository = {

  create: async (data) => {
    return await Contact.create(data);
  },

  insertMany: async (rows, options = {}) => {
    try {
      const result = await Contact.insertMany(rows, {
        ordered:   false,
        rawResult: true,
        ...options,
      });
      return result;
    } catch (err) {
      if (err.name === "BulkWriteError" || err.result) {
        return err.result;
      }
      throw err;
    }
  },

  findAll: async ({ filter = {}, page = 1, limit = 10, sort = { createdAt: -1 } }) => {
    assertCompanyScoped(filter);
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

  findById: async (id, companyId) => {
    return await Contact.findOne(scopedFilter(id, companyId))
      .populate("accountId", "accountName website primaryIndustry country salesPriority")
      .populate("campaignIds", "name status")
      .populate("importLogId", "fileName status");
  },

  update: async (id, data, companyId) => {
    return await Contact.findOneAndUpdate(scopedFilter(id, companyId), data, {
      new: true, runValidators: true,
    });
  },

  updateMany: async (filter, update) => {
    return await Contact.updateMany(filter, update);
  },

  delete: async (id, companyId) => {
    return await Contact.findOneAndDelete(scopedFilter(id, companyId));
  },

  findByAccountId: async (accountId, companyId) => {
    const cid = companyObjectId(requireCompanyId(companyId));
    return await Contact.find({ accountId, companyId: cid })
      .populate("campaignIds", "name status")
      .sort({ isPrimary: -1, createdAt: -1 });
  },

  countByAccountId: async (accountId, companyId) => {
    const cid = companyObjectId(requireCompanyId(companyId));
    return await Contact.countDocuments({ accountId, companyId: cid });
  },

  addCampaign: async (contactId, campaignId, companyId) => {
    return await Contact.findOneAndUpdate(
      scopedFilter(contactId, companyId),
      { $addToSet: { campaignIds: campaignId } },
      { new: true }
    );
  },

  removeCampaign: async (contactId, campaignId, companyId) => {
    return await Contact.findOneAndUpdate(
      scopedFilter(contactId, companyId),
      { $pull: { campaignIds: campaignId } },
      { new: true }
    );
  },
};

export default contactRepository;
