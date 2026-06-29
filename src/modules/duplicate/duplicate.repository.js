import mongoose from "mongoose";
import Duplicate from "./duplicate.model.js";

const attachLinkedRecord = (dup) => {
  const doc = { ...dup };
  if (doc.linkedProspect?.length) {
    doc.prospectId1 = doc.linkedProspect[0];
  } else if (doc.linkedContact?.length) {
    doc.prospectId1 = doc.linkedContact[0];
  } else if (doc.resolvedProspect?.length) {
    doc.prospectId1 = doc.resolvedProspect[0];
  }
  delete doc.linkedProspect;
  delete doc.linkedContact;
  delete doc.resolvedProspect;
  return doc;
};

const duplicateRepository = {

  create: async (data) => {
    return await Duplicate.create(data);
  },

  insertMany: async (docs) => {
    if (!docs.length) return [];
    return Duplicate.insertMany(docs, { ordered: false });
  },

  findAllForCompany: async ({ companyId, filter = {}, page = 1, limit = 10, entityType }) => {
    const cid = new mongoose.Types.ObjectId(companyId);
    const skip = (page - 1) * limit;
    const query = { ...filter, companyId: cid };
    if (entityType) query.entityType = entityType;

    const [duplicates, total] = await Promise.all([
      Duplicate.find(query)
        .populate("prospectId1")
        .populate("prospectId2")
        .populate("reviewedBy", "name email")
        .sort({ entityType: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Duplicate.countDocuments(query),
    ]);

    return { duplicates, total };
  },

  findAll: async ({ filter = {}, page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;

    const [duplicates, total] = await Promise.all([
      Duplicate.find(filter)
        .populate("prospectId1")  // refPath automatically populates as Prospect or Contact
        .populate("prospectId2")
        .populate("reviewedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Duplicate.countDocuments(filter),
    ]);

    return { duplicates, total };
  },

  findById: async (id) => {
    return await Duplicate.findById(id)
      .populate("prospectId1")
      .populate("prospectId2")
      .populate("reviewedBy", "name email");
  },

  update: async (id, data) => {
    return await Duplicate.findByIdAndUpdate(
      id,
      data,
      { new: true, runValidators: true }
    );
  },

  // Hard delete duplicate record from DB
  delete: async (id) => {
    return await Duplicate.findByIdAndDelete(id);
  },

  // Bulk hard delete
  deleteMany: async (ids) => {
    return await Duplicate.deleteMany({ _id: { $in: ids } });
  },
};

export default duplicateRepository;