import ImportLog from "./importLog.model.js";

const importLogRepository = {

  create: async (data) => {
    return await ImportLog.create(data);
  },

  findAll: async ({ page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      ImportLog.find()
        .populate("uploadedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ImportLog.countDocuments(),
    ]);

    return { logs, total };
  },

  findById: async (id) => {
    return await ImportLog.findById(id).populate("uploadedBy", "name email");
  },

  // Update import log after processing
  update: async (id, data) => {
    return await ImportLog.findByIdAndUpdate(id, data, { new: true });
  },
};

export default importLogRepository;