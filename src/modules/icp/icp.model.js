import mongoose from "mongoose";
import { INDUSTRIES } from "../../common/constants/taxonomy.js";

const icpSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "ICP profile name is required"],
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ── Company filters ──────────────────────────────────────────────────────
    industries: {
      type: [String],
      enum: INDUSTRIES,
      default: [],
    },
    businessModels: {
      type: [String],
      enum: ["B2B", "B2C", "B2B2C", "D2C", "E-Commerce", "Marketplace"],
      default: [],
    },
    annualRevenues: {
      type: [String],
      enum: [
        "Seed <$1M", "Early $1M-$10M", "Scale-Up $10M-$50M",
        "Mid-Market $50M-$250M", "Corporate $250M-$1B", "Enterprise $1B+",
      ],
      default: [],
    },
    employeeRanges: {
      type: [String],
      enum: ["1-50", "51-200", "201-500", "501-1,000", "1,001-5,000", "5,000+"],
      default: [],
    },

    // ── Target Market — replaces flat countries[] ────────────────────────────
    // Regions: include = match, exclude = block
    targetRegionsInclude: { type: [String], default: [] },
    targetRegionsExclude: { type: [String], default: [] },

    // Per-country exclusions within included regions (e.g. include APAC but exclude Pakistan)
    targetRegionCountriesExclude: { type: [String], default: [] },

    // Countries: include = match, exclude = block (separate from region logic)
    targetCountriesInclude: { type: [String], default: [] },
    targetCountriesExclude: { type: [String], default: [] },

    // ── Commercial Category ─────────────────────────────────────────────────
    commercialCategories: {
      type: [String],
      enum: [
        "Product Led", "SaaS / Subscriptions", "Professional Services",
        "Retail / E-Com", "Network / Platform", "Regulated (Health/Fin)", "Public / Gov",
      ],
      default: [],
    },

    // ── Tech Fit — include/exclude specific tools per category ───────────────
    // techStackInclude: tools the prospect MUST use (Core Match)
    // techStackExclude: tools that disqualify the prospect (No Match)
    techStackInclude: { type: [String], default: [] },
    techStackExclude: { type: [String], default: [] },

    // Tech category level include/exclude (Cloud Provider, CRM, Database etc.)
    // Frontend mein region jaisa UI — category include/exclude + individual tool exclude
    techCategoriesInclude: { type: [String], default: [] },
    techCategoriesExclude: { type: [String], default: [] },

    // ── Buyer Persona ────────────────────────────────────────────────────────
    buyerPersona: {
      targetSeniorities: {
        type: [String],
        enum: ["C-Suite", "VP", "Director", "Manager", "Senior IC"],
        default: [],
      },
      targetDepartments: { type: [String], default: [] },
      targetDesignations: { type: [String], default: [] },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const ICP = mongoose.model("ICP", icpSchema);
export default ICP;