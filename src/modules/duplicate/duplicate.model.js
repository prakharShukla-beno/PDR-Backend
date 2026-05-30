import mongoose from "mongoose";

const duplicateSchema = new mongoose.Schema(
  {
    // Existing record in DB — Prospect ya Contact ka _id
    prospectId1: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "entityType",  // dynamic ref — entityType pe depend karta hai
      required: [true, "Existing record reference is required"],
    },
    // Second record — null when newData comes from import file
    prospectId2: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "entityType",
      default: null,
    },
    // "Prospect" ya "Contact" — populate ke liye
    entityType: {
      type: String,
      enum: ["Prospect", "Contact"],
      default: "Prospect",
    },
    // Raw incoming data from import file — stored here for review before saving
    newData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // "import" = came from excel/csv file | "manual" = two existing DB records
    source: {
      type: String,
      enum: ["import", "manual"],
      default: "import",
    },
    importLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportLog",
      default: null,
    },
    // Which fields triggered the duplicate detection
    matchFields: {
      type: [String],
      required: [true, "Match fields are required"],
      enum: ["accountName", "website", "email"],
    },
    similarityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "merged", "skipped", "kept_both", "dismissed"],
      default: "pending",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Duplicate = mongoose.model("Duplicate", duplicateSchema);
export default Duplicate;