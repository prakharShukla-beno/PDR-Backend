import mongoose from "mongoose";

const importJobSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "importing",
        "processing",
        "completed",
        "completed_with_errors",
        "failed",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },
    cancelRequested: {
      type: Boolean,
      default: false,
    },
    totalRows: {
      type: Number,
      default: 0,
    },
    importedCount: {
      type: Number,
      default: 0,
    },
    processedRows: {
      type: Number,
      default: 0,
    },
    successCount: {
      type: Number,
      default: 0,
    },
    duplicateCount: {
      type: Number,
      default: 0,
    },
    errorCount: {
      type: Number,
      default: 0,
    },
    errorSamples: [
      {
        row: Number,
        reason: String,
      },
    ],
    missingIcpColumns: [String],
    startedAt: Date,
    completedAt: Date,
    errorMessage: String,
  },
  { timestamps: true }
);

importJobSchema.index({ companyId: 1, createdAt: -1 });

const ImportJob = mongoose.model("ImportJob", importJobSchema);
export default ImportJob;
