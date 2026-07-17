import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },
    type: {
      type: String,
      required: [true, "Notification type is required"],
      enum: ["import_complete", "enrichment_done", "enrichment_complete", "dedup_complete", "campaign_update"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
    },
    // Polymorphic reference — importLogs / campaigns / prospects
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    refCollection: {
      type: String,
      enum: ["importLogs", "campaigns", "prospects", null],
      default: null,
    },
    isRead: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Fast lookup — all notifications for the user
notificationSchema.index({ userId: 1, isRead: 1 });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;