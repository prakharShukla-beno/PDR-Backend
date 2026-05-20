import segmentRepository from "./segment.repository.js";
import Prospect from "../prospect/prospect.model.js";

const segmentService = {

  create: async (data, userId) => {
    const segment = await segmentRepository.create({
      ...data,
      createdBy: userId,
    });

    // Match count calculate karo
    const count = await segmentService.countMatches(segment.filters);
    await segmentRepository.updateMatchCount(segment._id, count);
    segment.matchCount = count;

    return segment;
  },

  getAll: async (userId) => {
    return await segmentRepository.findAll(userId);
  },

  getById: async (id) => {
    return await segmentRepository.findById(id);
  },

  update: async (id, data) => {
    const segment = await segmentRepository.update(id, data);
    if (data.filters) {
      const count = await segmentService.countMatches(data.filters);
      await segmentRepository.updateMatchCount(id, count);
    }
    return segment;
  },

  delete: async (id) => {
    return await segmentRepository.delete(id);
  },

  // Filters se matching prospects count
  countMatches: async (filters = {}) => {
    const query = {};
    if (filters.industries?.length)      query.primaryIndustry = { $in: filters.industries };
    if (filters.businessModels?.length)  query.businessModel   = { $in: filters.businessModels };
    if (filters.countries?.length)       query.country         = { $in: filters.countries };
    if (filters.employeeRanges?.length)  query.noOfEmployees   = { $in: filters.employeeRanges };
    if (filters.annualRevenues?.length)  query.annualRevenue   = { $in: filters.annualRevenues };
    if (filters.salesPriorities?.length) query.salesPriority   = { $in: filters.salesPriorities };
    if (filters.intentSignals?.length)   query.intentSignal    = { $in: filters.intentSignals };
    if (filters.minTechFitScore)         query.techFitScore    = { $gte: filters.minTechFitScore };
    return await Prospect.countDocuments(query);
  },

  // Matching prospects list
  getMatchingProspects: async (id, page = 1, limit = 10) => {
    const segment = await segmentRepository.findById(id);
    if (!segment) throw new Error("Segment nahi mila");

    const query = {};
    const f = segment.filters;
    if (f.industries?.length)      query.primaryIndustry = { $in: f.industries };
    if (f.businessModels?.length)  query.businessModel   = { $in: f.businessModels };
    if (f.countries?.length)       query.country         = { $in: f.countries };
    if (f.employeeRanges?.length)  query.noOfEmployees   = { $in: f.employeeRanges };
    if (f.annualRevenues?.length)  query.annualRevenue   = { $in: f.annualRevenues };
    if (f.salesPriorities?.length) query.salesPriority   = { $in: f.salesPriorities };
    if (f.intentSignals?.length)   query.intentSignal    = { $in: f.intentSignals };
    if (f.minTechFitScore)         query.techFitScore    = { $gte: f.minTechFitScore };

    const skip = (page - 1) * limit;
    const [prospects, total] = await Promise.all([
      Prospect.find(query).skip(skip).limit(limit).sort({ techFitScore: -1 }),
      Prospect.countDocuments(query),
    ]);

    return { prospects, total, page, limit };
  },
};

export default segmentService;