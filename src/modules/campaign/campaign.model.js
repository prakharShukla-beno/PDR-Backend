import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Campaign name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    promptUsed: {
      type: String,
      default: null,
    },
    prospectIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Prospect",
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator reference is required"],
    },
    status: {
      type: String,
      enum: ["draft", "active", "completed"],
      default: "draft",
    },

    // ── Performance Stats ──────────────────────────────────────────────────────
    stats: {
      sentCount:   { type: Number, default: 0 },
      openCount:   { type: Number, default: 0 },
      clickCount:  { type: Number, default: 0 },
      replyCount:  { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// Virtual — calculate open rate percentage on the fly
campaignSchema.virtual("openRate").get(function () {
  if (!this.stats.sentCount) return 0;
  return +((this.stats.openCount / this.stats.sentCount) * 100).toFixed(1);
});

// Virtual — calculate CTR percentage on the fly
campaignSchema.virtual("ctr").get(function () {
  if (!this.stats.sentCount) return 0;
  return +((this.stats.clickCount / this.stats.sentCount) * 100).toFixed(1);
});

campaignSchema.set("toJSON",   { virtuals: true });
campaignSchema.set("toObject", { virtuals: true });

const Campaign = mongoose.model("Campaign", campaignSchema);
export default Campaign;