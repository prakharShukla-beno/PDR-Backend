import mongoose from "mongoose";

const prospectSchema = new mongoose.Schema(
  {
    // ── Account Information ──────────────────────────────────────────────────
    accountName: {
      type: String,
      required: [true, "Account name is required"],
      trim: true,
    },
    // lowercase copy — exact match ke liye (regex nahi)
    accountNameLower: {
      type: String,
      trim: true,
      default: null,
    },
    accountSource: {
      type: String,
      enum: ["LinkedIn", "Google", "Social Media", "Referral", "Event", "Cold Outreach", null],
      default: null,
    },
    primaryIndustry: {
      type: String,
      enum: [
        "BFSI", "IT & ITES", "SaaS", "Fintech", "E-commerce",
        "Healthcare", "EdTech", "Logistics", "Manufacturing",
        "Retail & CPG", "Media & Telecom", "Real Estate", null,
      ],
      default: null,
    },
    commercialCategory: {
      type: String,
      enum: ["Product Led", "SaaS-Subscriptions", "Professional Services", "Retail-E-Com", null],
      default: null,
    },
    businessModel: {
      type: String,
      enum: ["B2B", "B2C", "D2C", "E-Commerce", "B2B2C", "Marketplace", null],
      default: null,
    },
    country: {
      type: String,
      trim: true,
      default: null,
    },
    hqLocationCity: {
      type: String,
      trim: true,
      default: null,
    },
    annualRevenue: {
      type: String,
      enum: [
        "Seed <$1M", "Early $1M-$10M", "Scale-Up $10M-$50M",
        "Mid-Market $50M-$250M", "Corporate $250M-$1B", "Enterprise $1B+", null,
      ],
      default: null,
    },
    noOfEmployees: {
      type: String,
      enum: ["1-50", "51-200", "201-1,000", "1,001-5,000", "5,000+", null],
      default: null,
    },

    // ── Tech Stack ───────────────────────────────────────────────────────────
    primaryTechStack:   { type: String, trim: true, default: null },
    secondaryTechStack: { type: String, trim: true, default: null },
    tertiaryTechStack:  { type: String, trim: true, default: null },
    techAdoptionProfile: {
      type: String,
      enum: ["Innovator", "Early Adopter", "Mainstream", "Laggard", "Leapfrog", null],
      default: null,
    },
    infrastructureRisk: {
      type: String,
      enum: ["EOL", "Data Silos", "Security Gaps", "Scalability Lock", "Shadow IT", null],
      default: null,
    },
    website: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    // ── Client Specific ──────────────────────────────────────────────────────
    campaignName: { type: String, trim: true, default: null },
    comments:     { type: String, trim: true, default: null },

    // ── Sales Intelligence ───────────────────────────────────────────────────
    techFitScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    financialCapacity: {
      type: String,
      enum: ["Enterprise", "Mid-Market", "Small Business", null],
      default: null,
    },
    marginPotential: {
      type: String,
      enum: ["High Margins", "Standard Margins", "Low Margins", null],
      default: null,
    },
    strategicValue: {
      type: String,
      enum: ["Market Maker", "VC Backed", "Standard", null],
      default: null,
    },
    historyTrigger: {
      type: String,
      enum: [
        "M&A Activity", "Capital Event", "Leadership Shakeup",
        "Regulatory Action", "Earnings Shock", "Security Incident",
        "Strategic Pivot", "Job Postings", null,
      ],
      default: null,
    },
    intentSignal: {
      type: String,
      enum: ["Hyper-Growth Mode", "Cost Containment", "Risk Mitigation", "Modernization Mandate", null],
      default: null,
    },
    servicePitch: {
      type: String,
      enum: [
        "Speed & Capacity", "Automation & Outsourcing",
        "Security & Compliance", "Future-Proofing", "Data Unification", null,
      ],
      default: null,
    },
    clvRanking: {
      type: String,
      enum: ["Tier-A (Strategic)", "Tier-B (Core)", "Tier-C (Mass)", null],
      default: null,
    },
    salesPriority: {
      type: String,
      enum: [
        "P1 (Tier A+Active)", "P2 (Tier B+Active)",
        "P3 (Tier A+Cold)", "P4 (Tier B+Cold)", null,
      ],
      default: null,
    },

    // ── Relational References ────────────────────────────────────────────────
    // contacts[] array HATA DIYA — ab Contact collection alag hai
    // Account detail page pe: GET /api/contacts?accountId=xxx
    importLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportLog",
      required: [true, "Import log reference is required"],
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    campaignIds:    [{ type: mongoose.Schema.Types.ObjectId, ref: "Campaign" }],
    interactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Interaction" }],

    // ── System ───────────────────────────────────────────────────────────────
    isDuplicate: { type: Boolean, default: false },
    source: {
      type: String,
      required: [true, "Source is required"],
      enum: ["excel", "apollo", "zoominfo", "manual"],
      default: "excel",
    },
  },
  { timestamps: true }
);

// ─── Pre-save: accountNameLower auto-set ──────────────────────────────────────
prospectSchema.pre("save", function () {
  if (this.accountName) {
    this.accountNameLower = this.accountName.toLowerCase().trim();
  }
});

// ─── Pre-insertMany: bulk insert mein bhi set karo ───────────────────────────
prospectSchema.pre("insertMany", function (next, docs) {
  docs.forEach((doc) => {
    if (doc.accountName) {
      doc.accountNameLower = doc.accountName.toLowerCase().trim();
    }
  });
  next();
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
prospectSchema.index({ accountName: "text", website: "text" });
prospectSchema.index({ accountName: 1 });
prospectSchema.index({ accountNameLower: 1 });   // exact match ke liye
prospectSchema.index({ website: 1 });
prospectSchema.index({ isDuplicate: 1 });
prospectSchema.index({ primaryIndustry: 1 });
prospectSchema.index({ country: 1 });
prospectSchema.index({ hqLocationCity: 1 });
prospectSchema.index({ salesPriority: 1 });
prospectSchema.index({ clvRanking: 1 });
prospectSchema.index({ intentSignal: 1 });
prospectSchema.index({ businessModel: 1 });
prospectSchema.index({ noOfEmployees: 1 });
prospectSchema.index({ annualRevenue: 1 });
prospectSchema.index({ techFitScore: 1 });
prospectSchema.index({ assignedTo: 1 });
prospectSchema.index({ source: 1 });

const Prospect = mongoose.model("Prospect", prospectSchema);
export default Prospect;