import notificationService from "./notification.service.js";

const notificationController = {

  // GET /api/notifications
  getAll: async (req, res, next) => {
    try {
      const result = await notificationService.getAll(
        req.user._id,
        req.query
      );

      res.status(200).json({
        success:     true,
        data:        result.notifications,
        unreadCount: result.unreadCount,
        pagination:  result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/notifications/:id/read
  markAsRead: async (req, res, next) => {
    try {
      const notification = await notificationService.markAsRead(
        req.params.id,
        req.user._id
      );

      res.status(200).json({
        success: true,
        message: "Notification marked as read",
        data:    notification,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/notifications/read-all
  markAllAsRead: async (req, res, next) => {
    try {
      const result = await notificationService.markAllAsRead(req.user._id);

      res.status(200).json({
        success:      true,
        message:      "All notifications marked as read",
        updatedCount: result.updatedCount,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/notifications/:id
  delete: async (req, res, next) => {
    try {
      const result = await notificationService.delete(
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

  // DELETE /api/notifications/read
  deleteAllRead: async (req, res, next) => {
    try {
      const result = await notificationService.deleteAllRead(req.user._id);

      res.status(200).json({
        success:      true,
        message:      "All read notifications deleted",
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default notificationController;