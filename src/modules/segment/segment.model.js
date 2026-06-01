import mongoose from "mongoose";

const segmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Segment name is required"],
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isShared: {
      type: Boolean,
      default: false,
    },

    // Filter criteria used to match prospects
    filters: {
      industries:      { type: [String], default: [] },
      businessModels:  { type: [String], default: [] },
      countries:       { type: [String], default: [] },
      employeeRanges:  { type: [String], default: [] },
      annualRevenues:  { type: [String], default: [] },
      salesPriorities: { type: [String], default: [] },
      intentSignals:   { type: [String], default: [] },
      minTechFitScore: { type: Number, default: null },
    },

    // Stored snapshot of matched prospect IDs (Apollo style)
    // These are saved at create/sync time — not recalculated every open
    matchedAccountIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prospect",
    }],

    // Total count of matched accounts
    matchCount: {
      type: Number,
      default: 0,
    },

    // Last time the snapshot was synced with fresh data
    lastSyncedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

segmentSchema.index({ createdBy: 1 });
segmentSchema.index({ isShared: 1 });

const Segment = mongoose.model("Segment", segmentSchema);
export default Segment;