import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    domain: {
      type: String,
      trim: true,
      lowercase: true,
    },
    logo: {
      type: String,
      default: null,
    },
    plan: {
      type: String,
      enum: ["free", "starter", "growth", "enterprise"],
      default: "free",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    settings: {
      allowSelfSignup: { type: Boolean, default: false },
      maxUsers: { type: Number, default: 5 },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

companySchema.pre("save", function () {
  if (this.isModified("name") && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }
});

const Company = mongoose.model("Company", companySchema);
export default Company;
