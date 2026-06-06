import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    // ── Account Reference ────────────────────────────────────────────────────
    // Apollo style — contact can exist without an associated account
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prospect",
      default: null,
    },
    accountName: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Denormalized Account Fields ──────────────────────────────────────────
    // These fields are copied from the account at import time
    // This avoids joining with account data when filtering contacts
    // Filters remain performant even with large datasets (e.g., 100k contacts)
    // These fields should be updated when the account is updated
    accountIndustry: {
      type: String,
      default: null,
    },
    accountCountry: {
      type: String,
      default: null,
    },
    accountCity: {
      type: String,
      default: null,
    },
    accountEmployees: {
      type: String,
      default: null,
    },
    accountRevenue: {
      type: String,
      default: null,
    },
    accountBusinessModel: {
      type: String,
      default: null,
    },
    accountSalesPriority: {
      type: String,
      default: null,
    },
    accountClvRanking: {
      type: String,
      default: null,
    },
    accountTechFitScore: {
      type: Number,
      default: null,
    },
    accountIntentSignal: {
      type: String,
      default: null,
    },
    accountWebsite: {
      type: String,
      default: null,
    },

    // ── Basic Info ───────────────────────────────────────────────────────────
    firstName: { type: String, trim: true, default: null },
    lastName:  { type: String, trim: true, default: null },

    // ── Role & Domain ────────────────────────────────────────────────────────
    functionalDomain: {
      type: String,
      enum: [
        "Corporate Strategy",
        "Technology & Digital",
        "Data & AI",
        "Finance & Accounting",
        "Revenue & Growth",
        "Product & Creative",
        "Operations & Logistics",
        "People & HR",
        "Legal & Governance",
        "Healthcare & Life Sciences",
        "Industrial & Engineering",
        "Resources & Utilities",
        "Public Sector & NGO",
        null,
      ],
      default: null,
    },
    keyFocusAreas:     { type: String, trim: true, default: null },
    standardizedRoles: { type: String, trim: true, default: null },

    // ── Contact Info ─────────────────────────────────────────────────────────
    email:                   { type: String, trim: true, lowercase: true, default: null },
    secondaryEmail:          { type: String, trim: true, lowercase: true, default: null },
    primaryPhone:            { type: String, trim: true, default: null },
    secondaryPhone:          { type: String, trim: true, default: null },
    primaryMobNo:            { type: String, trim: true, default: null },
    primaryPhoneExtension:   { type: String, trim: true, default: null },
    secondaryPhoneExtension: { type: String, trim: true, default: null },

    // ── Social & Web ─────────────────────────────────────────────────────────
    linkedIn:   { type: String, trim: true, default: null },
    twitterUrl: { type: String, trim: true, default: null },

    // ── Contact Location ─────────────────────────────────────────────────────
    // Contact's own location — may differ from the accountCountry
    country:  { type: String, trim: true, default: null },
    state:    { type: String, trim: true, default: null },
    city:     { type: String, trim: true, default: null },
    timeZone: { type: String, trim: true, default: null },

    // ── Computed Fields ──────────────────────────────────────────────────────
    // Computed flags for filtering — hasPhone, hasLinkedIn, etc.
    hasEmail:    { type: Boolean, default: false },
    hasPhone:    { type: Boolean, default: false },
    hasLinkedIn: { type: Boolean, default: false },

    // ── Relations ────────────────────────────────────────────────────────────
    campaignIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Campaign" }],
    importLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportLog",
      default: null,
    },

    // ── System ───────────────────────────────────────────────────────────────
    isPrimary: { type: Boolean, default: false },
    isLinked:  { type: Boolean, default: false }, // whether the contact is linked to an account
    source: {
      type: String,
      enum: ["excel", "csv", "manual", "account_import"],
      // account_import = contact imported from an account Excel
      default: "manual",
    },
  },
  { timestamps: true }
);

// ─── Pre-save — set computed fields automatically ────────────────────────────
contactSchema.pre("save", function () {
  this.hasEmail    = !!this.email;
  this.hasPhone    = !!(this.primaryPhone || this.primaryMobNo);
  this.hasLinkedIn = !!this.linkedIn;
});



contactSchema.pre("insertMany", function (next, docs) {
  if (!docs || !Array.isArray(docs)) {
    if (typeof next === "function") next();
    return;
  }
  docs.forEach((doc) => {
    doc.hasEmail    = !!doc.email;
    doc.hasPhone    = !!(doc.primaryPhone || doc.primaryMobNo);
    doc.hasLinkedIn = !!doc.linkedIn;
  });
  if (typeof next === "function") next();
});



// ─── Indexes ──────────────────────────────────────────────────────────────────
// Account link indexes
contactSchema.index({ accountId: 1 });
contactSchema.index({ accountName: 1 });
contactSchema.index({ isLinked: 1 });

// Contact field indexes
contactSchema.index({ email: 1 });
contactSchema.index({ functionalDomain: 1 });
contactSchema.index({ country: 1 });
contactSchema.index({ city: 1 });
contactSchema.index({ hasPhone: 1 });
contactSchema.index({ hasLinkedIn: 1 });

// Denormalized account field indexes — for filtering
contactSchema.index({ accountIndustry: 1 });
contactSchema.index({ accountCountry: 1 });
contactSchema.index({ accountCity: 1 });
contactSchema.index({ accountSalesPriority: 1 });
contactSchema.index({ accountClvRanking: 1 });
contactSchema.index({ accountEmployees: 1 });
contactSchema.index({ accountRevenue: 1 });
contactSchema.index({ accountBusinessModel: 1 });
contactSchema.index({ accountIntentSignal: 1 });

// Text search index
contactSchema.index({
  firstName: "text",
  lastName: "text",
  email: "text",
  standardizedRoles: "text",
  accountName: "text",
});

const Contact = mongoose.model("Contact", contactSchema);
export default Contact;