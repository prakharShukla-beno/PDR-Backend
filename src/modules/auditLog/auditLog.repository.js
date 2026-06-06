import AuditLog from "./auditLog.model.js";

const auditLogRepository = {

  create: async (data) => {
    return await AuditLog.create(data);
  },

  findAll: async ({ userId, entity, action, page = 1, limit = 20 }) => {
    const filter = {};
    if (userId)  filter.userId = userId;
    if (entity)  filter.entity = entity;
    if (action)  filter.action = action;

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate("userId", "name email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    return { logs, total };
  },
};

export default auditLogRepository;