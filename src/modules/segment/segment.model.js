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

    // ── Filters — jo ICP builder se aate hain ─────────────────────────────────
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

    // Kitne prospects match karte hain
    matchCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

segmentSchema.index({ createdBy: 1 });
segmentSchema.index({ isShared: 1 });

const Segment = mongoose.model("Segment", segmentSchema);
export default Segment;