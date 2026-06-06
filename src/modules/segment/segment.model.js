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

    // ICP reference — agar ICP se segment bana hai
    // ICP ke region/techStack filters yahan se use honge
    icpId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ICP",
      default: null,
    },

    // Filter criteria used to match prospects
    filters: {
      industries:      { type: [String], default: [] },
      businessModels:  { type: [String], default: [] },
      countries:       { type: [String], default: [] },  // manual segment ke liye
      employeeRanges:  { type: [String], default: [] },
      annualRevenues:  { type: [String], default: [] },
      salesPriorities: { type: [String], default: [] },
      intentSignals:   { type: [String], default: [] },
      minTechFitScore: { type: Number,   default: null },
      // Tier/priority post-enrichment filters
      tierFilter:      { type: [String], default: [] },
      priorityFilter:  { type: [String], default: [] },
      minFinalScore:   { type: Number,   default: null },
    },

    // Stored snapshot of matched prospect IDs (Apollo style)
    // Saved at create/sync time — not recalculated every open
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

    // Enrich & Score status
    // pending  = enrich nahi chala abhi
    // running  = Gemini enrichment chal raha hai
    // done     = sab accounts enrich + scored ho gaye
    // partial  = kuch accounts fail hue
    enrichStatus: {
      type: String,
      enum: ["pending", "running", "done", "partial"],
      default: "pending",
    },

    // Counts after enrichment
    enrichedCount: { type: Number, default: 0 },
    scoredCount:   { type: Number, default: 0 },
    lastEnrichedAt:{ type: Date,   default: null },
  },
  { timestamps: true }
);

segmentSchema.index({ createdBy: 1 });
segmentSchema.index({ isShared: 1 });
segmentSchema.index({ icpId: 1 });          // ICP se segment dhundne ke liye
segmentSchema.index({ enrichStatus: 1 });   // running segments track karne ke liye

const Segment = mongoose.model("Segment", segmentSchema);
export default Segment;