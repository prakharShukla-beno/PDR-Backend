import auditLogRepository from "./auditLog.repository.js";

const auditLogService = {

  // Create a log entry — callable from any module
  log: async ({ userId, action, entity, entityId, description, metadata, ipAddress }) => {
    try {
      return await auditLogRepository.create({
        userId, action, entity, entityId, description, metadata, ipAddress,
      });
    } catch (err) {
      // Audit log failure should not stop the main operation
      console.error("Audit log error:", err.message);
    }
  },

  getAll: async ({ userId, entity, action, page, limit }) => {
    return await auditLogRepository.findAll({ userId, entity, action, page, limit });
  },
};

export default auditLogService;