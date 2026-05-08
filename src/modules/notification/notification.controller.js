import notificationService from "./notification.service.js";

const notificationController = {

  // GET /api/notifications — user ki saari notifications
  getAll: async (req, res, next) => {
    try {
      const { page, limit, isRead } = req.query;

      const result = await notificationService.getAll({
        userId: req.user._id,
        page,
        limit,
        isRead,
      });

      res.status(200).json({
        success: true,
        data:       result.notifications,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/notifications/:id/read — single notification read mark karo
  markRead: async (req, res, next) => {
    try {
      const notification = await notificationService.markRead(
        req.params.id,
        req.user._id
      );

      res.status(200).json({
        success: true,
        message: "Notification marked as read",
        data: notification,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/notifications/read-all — saari notifications read mark karo
  markAllRead: async (req, res, next) => {
    try {
      await notificationService.markAllRead(req.user._id);

      res.status(200).json({
        success: true,
        message: "All notifications marked as read",
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/notifications/:id — single notification delete karo
  deleteOne: async (req, res, next) => {
    try {
      const result = await notificationService.deleteOne(
        req.params.id,
        req.user._id
      );

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/notifications/read — saari read notifications delete karo
  deleteAllRead: async (req, res, next) => {
    try {
      await notificationService.deleteAllRead(req.user._id);

      res.status(200).json({
        success: true,
        message: "All read notifications deleted",
      });
    } catch (error) {
      next(error);
    }
  },
};

export default notificationController;