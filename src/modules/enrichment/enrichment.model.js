import mongoose from "mongoose";

const enrichmentSchema = new mongoose.Schema(
  {
    prospectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prospect",
      required: [true, "Prospect reference is required"],
      unique: true, // One enrichment per prospect
    },
    techStack:          [{ type: String }],
    intentSignals:      [{ type: String }],
    strategicCategory: {
      type: String,
      enum: ["High Value", "Watch List", "Not a Fit", null],
      default: null,
    },
    icpMatch: {
      type: Boolean,
      default: null,
    },
    priorityScore: {
      type: Number,
      min: 0,
      max: 120,
      default: null,
    },
    enrichedBy: {
      type: String,
      enum: ["ai_module", "manual"],
      default: "ai_module",
    },
    enrichedAt: {
      type: Date,
      required: [true, "Enriched at timestamp is required"],
    },
  },
  {
    timestamps: true,
  }
);

const Enrichment = mongoose.model("Enrichment", enrichmentSchema);
export default Enrichment;