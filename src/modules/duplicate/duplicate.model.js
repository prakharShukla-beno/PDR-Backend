import mongoose from "mongoose";

const duplicateSchema = new mongoose.Schema(
  {
    prospectId1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prospect",
      required: [true, "First prospect reference is required"],
    },
    prospectId2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prospect",
      required: [true, "Second prospect reference is required"],
    },
    // Which fields triggered the duplicate flag
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
      enum: ["pending", "merged", "dismissed"],
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