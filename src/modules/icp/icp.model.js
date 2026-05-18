import mongoose from "mongoose";

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

    industries: {
      type: [String],
      enum: [
        "BFSI", "IT & ITES", "SaaS", "Fintech", "E-commerce",
        "Healthcare", "EdTech", "Logistics", "Manufacturing",
        "Retail & CPG", "Media & Telecom", "Real Estate",
      ],
      default: [],
    },
    businessModels: {
      type: [String],
      enum: ["B2B", "B2C", "B2B2C", "D2C", "E-Commerce", "Marketplace"],
      default: [],
    },
    countries: {
      type: [String],
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
    minTechFitScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    intentSignals: {
      type: [String],
      enum: [
        "Hyper-Growth Mode", "Cost Containment", "Risk Mitigation",
        "Modernization Mandate", "Hiring for Data role",
        "Capital Event", "Strategic Pivot", "Regulatory Action",
      ],
      default: [],
    },

    buyerPersona: {
      targetSeniorities: {
        type: [String],
        enum: ["C-Suite", "VP", "Director", "Manager", "Senior IC"],
        default: [],
      },
      targetDepartments: {
        type: [String],
        default: [],
      },
      targetDesignations: {
        type: [String],
        default: [],
      },
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const ICP = mongoose.model("ICP", icpSchema);
export default ICP;