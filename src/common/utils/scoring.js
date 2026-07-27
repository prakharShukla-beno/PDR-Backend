// ─────────────────────────────────────────────────────────────────────────────
// scoring.js — PDR Account Scoring Engine
//
// FORMULA SOURCE: Requirement document — "The Tiering Architecture"
//
//   Final Score = ((Financial + Strategic) × Industry) × TechFit
//
// DESIGN DECISION — Why Pure Formula (not Override):
//   Requirement document had two sections that looked contradictory:
//     - Waterfall section: "Market Maker → Force Tier A"
//     - Formula section:   "Market Maker = +40 bonus"
//
//   We chose PURE FORMULA because:
//     1. Stakeholder can see exact number — no magic "null" or hardcoded 61
//     2. Market Maker (+40) naturally reaches Tier A via formula anyway
//     3. Auditable — every score can be explained step by step
//     4. Dashboard sorting/averaging works with real numbers
//     5. No double weighting — Strategic is used once, in the formula only
//
// WORKS IN BOTH CASES:
//   Without AI → user fills fields manually → call calculateScore()
//   With AI    → Gemini fills missing fields → enrichment calls calculateScore()
// ─────────────────────────────────────────────────────────────────────────────

import {
  ALIGNMENT_TO_SCORE,
  getTechFitMultiplier as getTechFitMultiplierFromScore,
} from "./icpScoreHelpers.js";


// ── STEP 1: Tech Fit Score (0-100) ────────────────────────────────────────────

const getTechFitScore = (prospect, icpTechInclude = [], icpTechExclude = []) => {
  const prospectStack = prospect.primaryTechStack || [];

  if (icpTechInclude.length > 0 || icpTechExclude.length > 0) {
    const usesExcluded = icpTechExclude.some(t => prospectStack.includes(t));
    if (usesExcluded) return 20;

    if (icpTechInclude.length > 0) {
      const matchedTools = icpTechInclude.filter(t => prospectStack.includes(t));
      const matchRatio   = matchedTools.length / icpTechInclude.length;
      if (matchRatio >= 0.5) return 95;
      if (matchedTools.length > 0) return 82;
      return 20;
    }

    return 95;
  }

  const alignment = prospect.technologyAlignment;
  if (alignment && ALIGNMENT_TO_SCORE[alignment] !== undefined) {
    return ALIGNMENT_TO_SCORE[alignment];
  }

  const adoptionProfile = prospect.techAdoptionProfile;
  if (adoptionProfile === "Innovator" || adoptionProfile === "Early Adopter") return 95;
  if (adoptionProfile === "Mainstream") return 82;
  if (adoptionProfile === "Laggard" || adoptionProfile === "Leapfrog") return 20;

  const score = prospect.techFitScore;
  if (score !== null && score !== undefined) return score;

  return null;
};

// ── STEP 1b: Tech Fit Multiplier (4-band system) ───────────────────────────────

const getTechFitMultiplier = (prospect, icpTechInclude = [], icpTechExclude = []) => {
  const score = getTechFitScore(prospect, icpTechInclude, icpTechExclude);
  const { multiplier, band } = getTechFitMultiplierFromScore(score);

  let label = band;
  if (band === "Unknown") {
    label = "Not assessed — no penalty until enriched";
  } else if (score !== null && score !== undefined) {
    label = `${band} (score: ${score})`;
  }

  return {
    multiplier,
    techFitScore: score,
    techFitBand:  band,
    label,
  };
};


// ── STEP 2: Financial Points ──────────────────────────────────────────────────
// Source: Requirement "Financial Capacity (The Baseline)"
//
// Enterprise  $500M+         → 50 pts
// Mid-Market  $50M-$500M     → 25 pts
// Small Biz   <$50M          → 10 pts
//
// FIX: "$10M-$50M" was wrongly Mid-Market — now correctly Small Business
// UPDATED: revenue bucket labels changed to the new 7-bucket scheme
//   ("Scale-Up $10M-$50M" → "Growth $10M-$50M", "Mid-Market $50M-$250M" /
//    "Corporate $250M-$1B" → split into "Scale $50M-$100M" / "Mid-Market $100M-$500M" /
//    "Enterprise $500M-$1B", "Enterprise $1B+" → "Mega $1B+")
const getFinancialPoints = (prospect) => {
  const capacity = prospect.financialCapacity;
  const revenue  = prospect.annualRevenue;

  if (capacity === "Enterprise")     return { points: 50, label: "Enterprise (50 pts)" };
  if (capacity === "Mid-Market")     return { points: 25, label: "Mid-Market (25 pts)" };
  if (capacity === "Small Business") return { points: 10, label: "Small Business (10 pts)" };

  if (!revenue) return { points: 10, label: "Unknown — Small Business default (10 pts)" };

  if (revenue.includes("$1B+") || revenue.includes("$500M-$1B"))
    return { points: 50, label: "Enterprise $500M+ (50 pts)" };

  if (revenue.includes("$50M-$100M") || revenue.includes("$100M-$500M"))
    return { points: 25, label: "Mid-Market $50M-$500M (25 pts)" };

  // FIX: "$10M-$50M" is Small Business, not Mid-Market
  if (
    revenue.includes("$10M-$50M") ||
    revenue.includes("$1M-$10M")  ||
    revenue.includes("<$1M")       ||
    revenue.includes("Seed")       ||
    revenue.includes("Early")      ||
    revenue.includes("Growth")
  ) return { points: 10, label: "Small Business <$50M (10 pts)" };

  return { points: 10, label: "Small Business default (10 pts)" };
};


// ── STEP 3: Strategic Bonus ───────────────────────────────────────────────────
// Source: Requirement "Strategic Value (The Bonus)"
//
// Market Maker  → +40
// VC Backed     → +20
// Standard      → +0
//
// FIX: This is a bonus in the formula — NOT a separate tier override
// Removed checkStrategicOverride() — that was causing double weighting
const getStrategicBonus = (prospect) => {
  const value = prospect.strategicValue;
  if (value === "Market Maker") return { bonus: 40, label: "Market Maker (+40)" };
  if (value === "VC Backed")    return { bonus: 20, label: "VC Backed (+20)" };
  return                               { bonus: 0,  label: "Standard (+0)" };
};


// ── STEP 4: Industry Multiplier ───────────────────────────────────────────────
// Source: Requirement "Sector Attractiveness (The Modifier)"
//
// High Margins     → ×1.2
// Standard Margins → ×1.0
// Low Margins      → ×0.8
const getIndustryMultiplier = (prospect) => {
  const margin   = prospect.marginPotential;
  const industry = prospect.primaryIndustry;

  if (margin === "High Margins")     return { multiplier: 1.2, label: "High Margin (×1.2)" };
  if (margin === "Standard Margins") return { multiplier: 1.0, label: "Standard (×1.0)" };
  if (margin === "Low Margins")      return { multiplier: 0.8, label: "Low Margin (×0.8)" };

  const HIGH = ["BFSI", "SaaS", "Healthcare", "Fintech"];
  const LOW  = ["Retail & CPG", "Logistics", "E-commerce"];

  if (!industry)               return { multiplier: 1.0, label: "Unknown — Standard default (×1.0)" };
  if (HIGH.includes(industry)) return { multiplier: 1.2, label: `High Margin — ${industry} (×1.2)` };
  if (LOW.includes(industry))  return { multiplier: 0.8, label: `Low Margin — ${industry} (×0.8)` };
  return                              { multiplier: 1.0, label: `Standard — ${industry} (×1.0)` };
};


// ── STEP 5: Tier from Score ───────────────────────────────────────────────────
// Source: Requirement "Determine Tiers by Score Range"
// > 60  → Tier-A (Strategic)
// 30-60 → Tier-B (Core)
// < 30  → Tier-C (Mass)
const getTierFromScore = (score) => {
  if (score > 60)  return "Tier-A (Strategic)";
  if (score >= 30) return "Tier-B (Core)";
  return "Tier-C (Mass)";
};


// ── STEP 6: Priority from Tier + Intent ──────────────────────────────────────
// Source: Requirement "Sales Priority Matrix"
const getPriorityFromTierAndIntent = (clvRanking, intentSignal) => {
  const isActive = !!intentSignal;
  if (clvRanking?.includes("A") && isActive)  return "P1 (Tier A+Active)";
  if (clvRanking?.includes("B") && isActive)  return "P2 (Tier B+Active)";
  if (clvRanking?.includes("A") && !isActive) return "P3 (Tier A+Cold)";
  if (clvRanking?.includes("B") && !isActive) return "P4 (Tier B+Cold)";
  return null; // Tier C → marketing automation only
};


// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
// Pass any prospect object → returns score, tier, priority, full breakdown
//
// Example:
//   Input:  { financialCapacity: "Mid-Market", strategicValue: "VC Backed",
//              marginPotential: "High Margins", technologyAlignment: "Core Match",
//              intentSignal: "Hyper-Growth Mode" }
//   Output: { finalScore: 54, clvRanking: "Tier-B (Core)",
//              salesPriority: "P2 (Tier B+Active)",
//              breakdown: { formula: "((25+20)×1.2)×1.0 = 54" } }
// icpProfile is optional — pass it to enable ICP-based tech fit comparison
export const calculateScore = (prospect, icpProfile = null) => {

  const icpTechInclude = icpProfile?.techStackInclude || [];
  const icpTechExclude = icpProfile?.techStackExclude || [];

  // STEP 1 — Tech Fit (gatekeeper)
  const techFit = getTechFitMultiplier(prospect, icpTechInclude, icpTechExclude);

  const techFitScoreForLog = techFit.techFitScore ?? "null";
  console.log(`TechFit for ${prospect.accountName || prospect._id}:
  technologyAlignment=${prospect.technologyAlignment}
  → multiplier=${techFit.multiplier}, techFitScore=${techFitScoreForLog}, band=${techFit.techFitBand}`);

  if (techFit.multiplier === 0) {
    return {
      finalScore:    0,
      techFitScore:  0,
      clvRanking:    "Tier-C (Mass)",
      salesPriority: null,
      disqualified:  true,
      breakdown: {
        techFit,
        financial:  null,
        strategic:  null,
        industry:   null,
        formula:    "Disqualified at Tech Fit — all other steps skipped",
        finalScore: 0,
      },
    };
  }

  // STEP 2 — Financial
  const financial = getFinancialPoints(prospect);

  // STEP 3 — Strategic bonus
  const strategic = getStrategicBonus(prospect);

  // STEP 4 — Industry
  const industry = getIndustryMultiplier(prospect);

  // STEP 5 — Full formula: ((Financial + Strategic) × Industry) × TechFit
  const rawScore   = ((financial.points + strategic.bonus) * industry.multiplier) * techFit.multiplier;
  const finalScore = Math.round(rawScore);

  // STEP 6 — Tier
  const clvRanking = getTierFromScore(finalScore);

  // STEP 7 — Priority
  const salesPriority = getPriorityFromTierAndIntent(clvRanking, prospect.intentSignal);

  const techFitScore = techFit.techFitScore ?? (
    techFit.multiplier === 1.0 ? 95 :
    techFit.multiplier === 0.8 ? 82 :
    techFit.multiplier === 0.5 ? 55 : 0
  );

  return {
    finalScore,
    techFitScore,
    clvRanking,
    salesPriority,
    disqualified: false,
    breakdown: {
      techFit,
      financial,
      strategic,
      industry,
      formula:    `((${financial.points} + ${strategic.bonus}) × ${industry.multiplier}) × ${techFit.multiplier} = ${finalScore}`,
      finalScore,
    },
  };
};