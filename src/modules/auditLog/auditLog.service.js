import auditLogRepository from "./auditLog.repository.js";

const auditLogService = {

  // Log entry create karo — kisi bhi module se call kar sakte ho
  log: async ({ userId, action, entity, entityId, description, metadata, ipAddress }) => {
    try {
      return await auditLogRepository.create({
        userId, action, entity, entityId, description, metadata, ipAddress,
      });
    } catch (err) {
      // Audit log fail hone se main operation nahi rukna chahiye
      console.error("Audit log error:", err.message);
    }
  },

  getAll: async ({ userId, entity, action, page, limit }) => {
    return await auditLogRepository.findAll({ userId, entity, action, page, limit });
  },
};

export default auditLogService;