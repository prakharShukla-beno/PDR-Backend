import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Campaign name is required"],
      trim: true,
    },
    description: { type: String, trim: true, default: null },
    promptUsed:  { type: String, default: null },

    // ── Apollo style — Contacts in campaign ───────────────────────────────────
    // prospectIds → REMOVED (accounts add karna galat tha)
    // contactIds  → Contacts directly campaign mein jaate hain
    contactIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Contact" },
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

    // ── Performance Stats — FR-9.3 ────────────────────────────────────────────
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

// Virtual — openRate %
campaignSchema.virtual("openRate").get(function () {
  if (!this.stats.sentCount) return 0;
  return +((this.stats.openCount / this.stats.sentCount) * 100).toFixed(1);
});

// Virtual — CTR %
campaignSchema.virtual("ctr").get(function () {
  if (!this.stats.sentCount) return 0;
  return +((this.stats.clickCount / this.stats.sentCount) * 100).toFixed(1);
});

// Virtual — total contacts
campaignSchema.virtual("contactCount").get(function () {
  return this.contactIds?.length || 0;
});

campaignSchema.set("toJSON",   { virtuals: true });
campaignSchema.set("toObject", { virtuals: true });

campaignSchema.index({ status: 1 });
campaignSchema.index({ createdBy: 1 });

const Campaign = mongoose.model("Campaign", campaignSchema);
export default Campaign;