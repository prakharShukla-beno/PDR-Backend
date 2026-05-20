import mongoose from "mongoose";

// ─── Embedded Contact Sub-Schema ───────────────────────────────────────────────
const contactSchema = new mongoose.Schema(
  {
    name:        { type: String, trim: true, default: null },
    designation: { type: String, trim: true, default: null },
    department:  { type: String, trim: true, default: null },
    seniority: {
      type: String,
      enum: ["C-Suite", "VP", "Director", "Manager", "Individual Contributor", null],
      default: null,
    },
    email:     { type: String, trim: true, lowercase: true, default: null },
    phone:     { type: String, trim: true, default: null },
    phone2:    { type: String, trim: true, default: null },  // ← client: Phone 2
    linkedIn:  { type: String, trim: true, default: null },
    job1:      { type: String, trim: true, default: null },  // ← client: Job1
    job2:      { type: String, trim: true, default: null },  // ← client: Job2
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true }
);

// ─── Main Prospect Schema ──────────────────────────────────────────────────────
const prospectSchema = new mongoose.Schema(
  {
    // ── Account Information ────────────────────────────────────────────────────
    accountName: {
      type: String,
      required: [true, "Account name is required"],
      trim: true,
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
        "Retail & CPG", "Media & Telecom", "Real Estate", null
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

    // ── Tech Stack ─────────────────────────────────────────────────────────────
    primaryTechStack: {
      type: String,
      trim: true,  // free text — client file mein koi bhi value ho sakti hai
      default: null,
    },
    secondaryTechStack: {
      type: String,
      trim: true,  // ← client: Tech2
      default: null,
    },
    tertiaryTechStack: {
      type: String,
      trim: true,  // ← client: Tech3
      default: null,
    },
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

    // ── Client Specific Fields ─────────────────────────────────────────────────
    campaignName: {
      type: String,
      trim: true,   // ← client: Campaign column
      default: null,
    },
    comments: {
      type: String,
      trim: true,   // ← client: Comments column
      default: null,
    },

    // ── Sales Intelligence ─────────────────────────────────────────────────────
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

    // ── Contacts (POC) — Embedded Array ───────────────────────────────────────
    contacts: [contactSchema],

    // ── Relational References ──────────────────────────────────────────────────
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
    campaignIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" },
    ],
    interactionIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Interaction" },
    ],

    // ── System & Control ───────────────────────────────────────────────────────
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

// ─── Indexes ───────────────────────────────────────────────────────────────────
prospectSchema.index({ accountName: "text", website: "text" });
prospectSchema.index({ accountName: 1 });
prospectSchema.index({ website: 1 });
prospectSchema.index({ isDuplicate: 1 });
prospectSchema.index({ primaryIndustry: 1 });
prospectSchema.index({ country: 1 });
prospectSchema.index({ salesPriority: 1 });
prospectSchema.index({ assignedTo: 1 });
prospectSchema.index({ campaignName: 1 });

const Prospect = mongoose.model("Prospect", prospectSchema);
export default Prospect;