import Prospect from "./prospect.model.js";

const prospectRepository = {

  create: async (data) => {
    return await Prospect.create(data);
  },

  insertMany: async (rows, options = {}) => {
    try {
      const prepared = rows.map(r => ({
        ...r,
        accountNameLower: r.accountName
          ? r.accountName.toLowerCase().trim()
          : null,
      }));

      const result = await Prospect.insertMany(prepared, {
        ordered:        false,
        rawResult:      true,
        runValidators:  false,
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
    const skip = (page - 1) * limit;

    const [prospects, total] = await Promise.all([
      Prospect.find(filter)
        .populate("assignedTo", "name email")
        .populate("importLogId", "fileName status")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Prospect.countDocuments(filter),
    ]);

    return { prospects, total };
  },

  findById: async (id, companyId) => {
    const filter = companyId ? { _id: id, companyId } : { _id: id };
    return await Prospect.findOne(filter)
      .populate("assignedTo", "name email")
      .populate("importLogId", "fileName status importType")
      .populate("campaignIds", "name status")
      .populate("interactionIds", "type outcome interactedAt");
  },

  update: async (id, data, companyId) => {
    const filter = companyId ? { _id: id, companyId } : { _id: id };
    return await Prospect.findOneAndUpdate(filter, data, { new: true, runValidators: true });
  },

  updateSkipValidation: async (id, data, companyId) => {
    const filter = companyId ? { _id: id, companyId } : { _id: id };
    return await Prospect.findOneAndUpdate(filter, data, { new: true, runValidators: false });
  },

  delete: async (id, companyId) => {
    const filter = companyId ? { _id: id, companyId } : { _id: id };
    return await Prospect.findOneAndDelete(filter);
  },

  findDuplicates: async ({ accountName, website, companyId }) => {
    const conditions = [];

    if (accountName) {
      conditions.push({
        accountName: { $regex: new RegExp(`^${accountName}$`, "i") },
      });
    }

    if (website) {
      conditions.push({
        website: website.toLowerCase().trim(),
      });
    }

    if (conditions.length === 0) return [];

    const filter = companyId
      ? { companyId, $or: conditions }
      : { $or: conditions };

    return await Prospect.find(filter).select(
      "accountName website isDuplicate companyId"
    );
  },

  addCampaign: async (prospectId, campaignId, companyId) => {
    const filter = companyId ? { _id: prospectId, companyId } : { _id: prospectId };
    return await Prospect.findOneAndUpdate(
      filter,
      { $addToSet: { campaignIds: campaignId } },
      { new: true }
    );
  },

  addInteraction: async (prospectId, interactionId, companyId) => {
    const filter = companyId ? { _id: prospectId, companyId } : { _id: prospectId };
    return await Prospect.findOneAndUpdate(
      filter,
      { $addToSet: { interactionIds: interactionId } },
      { new: true }
    );
  },
};

export default prospectRepository;
