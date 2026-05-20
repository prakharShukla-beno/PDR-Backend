import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    // Account reference — optional (Apollo style)
    // Contact exist kar sakta hai bina account ke bhi
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prospect",
      default: null,  // ← required hata diya
    },

    // Account name — import ke time store karo
    // Agar accountId null hai toh bhi pata rahega
    accountName: {
      type: String,
      trim: true,
      default: null,
    },

    // Basic Info
    firstName: { type: String, trim: true, default: null },
    lastName:  { type: String, trim: true, default: null },

    // Role & Domain
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
    keyFocusAreas:    { type: String, trim: true, default: null },
    standardizedRoles: { type: String, trim: true, default: null },

    // Contact Info
    email:                   { type: String, trim: true, lowercase: true, default: null },
    secondaryEmail:          { type: String, trim: true, lowercase: true, default: null },
    primaryPhone:            { type: String, trim: true, default: null },
    secondaryPhone:          { type: String, trim: true, default: null },
    primaryMobNo:            { type: String, trim: true, default: null },
    primaryPhoneExtension:   { type: String, trim: true, default: null },
    secondaryPhoneExtension: { type: String, trim: true, default: null },

    // Social & Web
    linkedIn:   { type: String, trim: true, default: null },
    twitterUrl: { type: String, trim: true, default: null },

    // Location
    country:  { type: String, trim: true, default: null },
    state:    { type: String, trim: true, default: null },
    city:     { type: String, trim: true, default: null },
    timeZone: { type: String, trim: true, default: null },

    // Relations
    campaignIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Campaign" }],
    importLogId: { type: mongoose.Schema.Types.ObjectId, ref: "ImportLog", default: null },

    // System
    isPrimary: { type: Boolean, default: false },
    isLinked:  { type: Boolean, default: false }, // account se linked hai ya nahi
    source: {
      type: String,
      enum: ["excel", "csv", "manual"],
      default: "manual",
    },
  },
  { timestamps: true }
);

contactSchema.index({ accountId: 1 });
contactSchema.index({ accountName: 1 });
contactSchema.index({ email: 1 });
contactSchema.index({ functionalDomain: 1 });
contactSchema.index({ firstName: "text", lastName: "text", email: "text" });

const Contact = mongoose.model("Contact", contactSchema);
export default Contact;