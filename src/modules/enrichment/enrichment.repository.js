import Enrichment from "./enrichment.model.js";

const enrichmentRepository = {

  // Save new enrichment record
  create: async (data) => {
    return await Enrichment.create(data);
  },

  // Find enrichment by prospectId
  findByProspectId: async (prospectId) => {
    return await Enrichment.findOne({ prospectId }).populate(
      "prospectId",
      "accountName website primaryIndustry salesPriority"
    );
  },

  // Upsert — update if exists, otherwise create
  upsertByProspectId: async (prospectId, data) => {
    return await Enrichment.findOneAndUpdate(
      { prospectId },
      { ...data, prospectId },
      { new: true, upsert: true, runValidators: true }
    );
  },

  // Get all enrichments with pagination
  findAll: async ({ page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;

    const [enrichments, total] = await Promise.all([
      Enrichment.find()
        .populate("prospectId", "accountName website primaryIndustry salesPriority")
        .sort({ enrichedAt: -1 })
        .skip(skip)
        .limit(limit),
      Enrichment.countDocuments(),
    ]);

    return { enrichments, total };
  },
};

export default enrichmentRepository;