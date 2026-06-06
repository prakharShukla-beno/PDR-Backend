import auditLogService from "./auditLog.service.js";

const auditLogController = {

  // GET /api/audit-logs
  getAll: async (req, res, next) => {
    try {
      const { userId, entity, action, page = 1, limit = 20 } = req.query;
      const result = await auditLogService.getAll({
        userId, entity, action,
        page: +page, limit: +limit,
      });

      res.status(200).json({
        success: true,
        data: {
          logs: result.logs,
          total: result.total,
          page: +page,
          totalPages: Math.ceil(result.total / +limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

export default auditLogController;