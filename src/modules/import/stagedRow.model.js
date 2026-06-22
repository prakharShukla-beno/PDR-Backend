import mongoose from "mongoose";

const stagedRowSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportJob",
      required: true,
      index: true,
    },
    rowIndex: {
      type: Number,
      required: true,
    },
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    processed: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

stagedRowSchema.index({ jobId: 1, processed: 1 });
stagedRowSchema.index({ jobId: 1, rowIndex: 1 });

const StagedRow = mongoose.model("StagedRow", stagedRowSchema);
export default StagedRow;
