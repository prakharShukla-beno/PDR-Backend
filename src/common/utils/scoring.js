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


// ── STEP 1: Tech Fit Multiplier ───────────────────────────────────────────────
// This is the GATEKEEPER — if 0, final score = 0 (account disqualified)
//
// Priority order:
//   1. technologyAlignment  (direct: "Core Match" / "Adjacent Match" / "No Match")
//   2. techFitScore         (manual 0-100 entry)
//   3. techAdoptionProfile  (maturity proxy — fallback only)
//
// FIX: technologyAlignment is the correct field per requirement
// techAdoptionProfile is only a fallback
const getTechFitMultiplier = (prospect) => {

  // Primary: direct alignment field
  const alignment = prospect.technologyAlignment;
  if (alignment === "Core Match")     return { multiplier: 1.0, label: "Core Match" };
  if (alignment === "Adjacent Match") return { multiplier: 0.5, label: "Adjacent Match" };
  if (alignment === "No Match")       return { multiplier: 0.0, label: "No Match — Disqualified" };

  // Secondary: manually entered score
  const score = prospect.techFitScore;
  if (score !== null && score !== undefined) {
    if (score >= 90) return { multiplier: 1.0, label: `Core Match (score: ${score})` };
    if (score >= 50) return { multiplier: 0.5, label: `Adjacent Match (score: ${score})` };
    return            { multiplier: 0.0, label: `No Match (score: ${score}) — Disqualified` };
  }

  // Fallback: adoption profile
  const profile = prospect.techAdoptionProfile;
  if (!profile) return { multiplier: 0.5, label: "Not assessed — Adjacent by default" };
  if (["Innovator", "Early Adopter"].includes(profile))
    return { multiplier: 1.0, label: `Core Match (profile: ${profile})` };
  if (profile === "Mainstream")
    return { multiplier: 0.5, label: `Adjacent Match (profile: ${profile})` };
  return { multiplier: 0.0, label: `No Match (profile: ${profile}) — Disqualified` };
};


// ── STEP 2: Financial Points ──────────────────────────────────────────────────
// Source: Requirement "Financial Capacity (The Baseline)"
//
// Enterprise  > $200M      → 50 pts
// Mid-Market  $50M-$200M   → 25 pts
// Small Biz   < $50M       → 10 pts
//
// FIX: "$10M-$50M" was wrongly Mid-Market — now correctly Small Business
const getFinancialPoints = (prospect) => {
  const capacity = prospect.financialCapacity;
  const revenue  = prospect.annualRevenue;

  if (capacity === "Enterprise")     return { points: 50, label: "Enterprise (50 pts)" };
  if (capacity === "Mid-Market")     return { points: 25, label: "Mid-Market (25 pts)" };
  if (capacity === "Small Business") return { points: 10, label: "Small Business (10 pts)" };

  if (!revenue) return { points: 10, label: "Unknown — Small Business default (10 pts)" };

  if (revenue.includes("$1B") || revenue.includes("$250M-$1B"))
    return { points: 50, label: "Enterprise >$200M (50 pts)" };

  if (revenue.includes("$50M-$250M"))
    return { points: 25, label: "Mid-Market $50M-$200M (25 pts)" };

  // FIX: "$10M-$50M" is Small Business, not Mid-Market
  if (
    revenue.includes("$10M-$50M") ||
    revenue.includes("$1M-$10M")  ||
    revenue.includes("<$1M")       ||
    revenue.includes("Seed")       ||
    revenue.includes("Early")
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
export const calculateScore = (prospect) => {

  // STEP 1 — Tech Fit (gatekeeper)
  const techFit = getTechFitMultiplier(prospect);

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

  // Convert multiplier → 0-100 for techFitScore field in DB
  const techFitScore =
    techFit.multiplier === 1.0 ? 90 :
    techFit.multiplier === 0.5 ? 60 : 0;

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
