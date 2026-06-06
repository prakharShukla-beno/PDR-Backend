import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "CREATE", "UPDATE", "DELETE", "IMPORT",
        "LOGIN", "LOGOUT", "EXPORT", "ASSIGN",
        "ROLE_CHANGE", "CAMPAIGN_LAUNCH",
      ],
    },
    entity: {
      type: String,
      required: true,
      enum: ["Prospect", "Campaign", "ICP", "Segment", "User", "Import", "Duplicate"],
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    description: {
      type: String,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ entity: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);
export default AuditLog;