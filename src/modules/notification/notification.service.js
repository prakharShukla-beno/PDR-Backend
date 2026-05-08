import Notification from "./notification.model.js";

const notificationService = {

  // Create notification — internally called by other modules
  create: async ({ userId, type, message, refId = null, refCollection = null }) => {
    return await Notification.create({
      userId,
      type,
      message,
      refId,
      refCollection,
      isRead: false,
    });
  },

  // Get all notifications for logged in user
  getAll: async (userId, query) => {
    const { page = 1, limit = 10, isRead } = query;
    const skip = (page - 1) * limit;

    const filter = { userId };

    // Filter by read/unread if provided
    if (isRead !== undefined) {
      filter.isRead = isRead === "true";
    }

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Notification.countDocuments(filter),
    ]);

    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false,
    });

    return {
      notifications,
      unreadCount,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  // Mark single notification as read
  markAsRead: async (notificationId, userId) => {
    const notification = await Notification.findOneAndUpdate(
      {
        _id:    notificationId,
        userId, 
      },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      const error = new Error("Notification not found");
      error.statusCode = 404;
      throw error;
    }

    return notification;
  },

  // Mark all notifications as read
  markAllAsRead: async (userId) => {
    const result = await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );

    return { updatedCount: result.modifiedCount };
  },

  // Delete single notification
  delete: async (notificationId, userId) => {
    const notification = await Notification.findOneAndDelete({
      _id:    notificationId,
      userId,
    });

    if (!notification) {
      const error = new Error("Notification not found");
      error.statusCode = 404;
      throw error;
    }

    return { message: "Notification deleted successfully" };
  },

  // Delete all read notifications — cleanup
  deleteAllRead: async (userId) => {
    const result = await Notification.deleteMany({
      userId,
      isRead: true,
    });

    return { deletedCount: result.deletedCount };
  },
};

export default notificationService;