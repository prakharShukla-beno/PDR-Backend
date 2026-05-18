import mongoose from "mongoose";

const importLogSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: [true, "File name is required"],
      trim: true,
    },
    importType: {
      type: String,
      required: [true, "Import type is required"],
      enum: ["excel", "apollo", "zoominfo"],
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Uploaded by user is required"],
    },
    totalRows:    { type: Number, required: true, default: 0 },
    successCount: { type: Number, required: true, default: 0 },
    failedCount:  { type: Number, required: true, default: 0 },
    errorDetails: [{ type: String }],  // Per-row error messages
    status: {
      type: String,
      required: true,
      enum: ["processing", "completed", "partial", "failed"],
      default: "completed",
    },
  },
  {
    timestamps: true,
  }
);

const ImportLog = mongoose.model("ImportLog", importLogSchema);
export default ImportLog;