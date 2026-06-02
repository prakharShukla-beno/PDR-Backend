/**
 * SCORING ENGINE
 * Implements the 4-variable weighted scoring formula for account tiering
 * Formula: Final_Score = ((Revenue_Points + Strategy_Bonus) × Industry_Multiplier) × Tech_Fit_Binary
 */

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const REVENUE_POINTS = {
  "Enterprise $1B+": 50,
  "Corporate $250M-$1B": 50,
  "Mid-Market $50M-$250M": 25,
  "Scale-Up $10M-$50M": 25,
  "Early $1M-$10M": 10,
  "Seed <$1M": 10,
};

const STRATEGY_BONUS = {
  "Market Maker": 40,
  "VC Backed": 20,
  "Standard": 0,
};

const INDUSTRY_MULTIPLIER = {
  // High Margin (Regulated, sticky, high-rate industries)
  "BFSI": 1.2,
  "Healthcare": 1.2,
  "Pharma": 1.2,
  "SaaS": 1.2,
  "Legal": 1.2,

  // Standard Margin
  "Manufacturing": 1.0,
  "Professional Services": 1.0,
  "IT & ITES": 1.0,
  "EdTech": 1.0,
  "Energy": 1.0,
  "Education": 1.0,

  // Low Margin (Volume-based, price-sensitive)
  "Retail & CPG": 0.8,
  "Logistics": 0.8,
  "Construction": 0.8,
  "Govt": 0.8,
  "Hospitality": 0.8,
  "E-commerce": 0.8,
  "Real Estate": 0.8,
  "Media & Telecom": 0.8,
  "Fintech": 1.0, // Standard (volatile but lucrative)
};

const TECH_FIT_MULTIPLIER = {
  "Core Match": 1.0, // Exact stack
  "Adjacent Match": 0.5, // Compatible but not specialist
  "No Match": 0.0, // Incompatible → DISQUALIFY
};

const TIER_BUCKETS = {
  A: { min: 60, max: 100, label: "Tier-A (Strategic)" },
  B: { min: 30, max: 59, label: "Tier-B (Core)" },
  C: { min: 0, max: 29, label: "Tier-C (Mass)" },
};

const INTENT_LEVELS = {
  "Hyper-Growth Mode": "High",
  "Cost Containment": "Low",
  "Risk Mitigation": "High",
  "Modernization Mandate": "High",
  "Integration": "High",
  null: "Low",
};

// ─── STEP 1: Tech Fit Kill Switch ─────────────────────────────────────────
const validateTechFit = (techFitOption) => {
  if (techFitOption === "No Match" || techFitOption === "No Match / Legacy") {
    return {
      isValid: false,
      multiplier: 0.0,
      reason: "Tech stack incompatible — prospect disqualified",
    };
  }
  if (techFitOption === "Core Match") {
    return { isValid: true, multiplier: 1.0, reason: "Core match" };
  }
  if (techFitOption === "Adjacent Match") {
    return { isValid: true, multiplier: 0.5, reason: "Adjacent match (demote tier)" };
  }
  return { isValid: true, multiplier: 1.0, reason: "Default to core match" };
};

// ─── STEP 2: Strategic Override ───────────────────────────────────────────
const applyStrategicBonus = (prospect) => {
  const bonus = STRATEGY_BONUS[prospect.strategicValue] || 0;
  const isOverride = prospect.strategicValue === "Market Maker" || prospect.strategicValue === "VC Backed";
  
  return {
    bonus,
    isOverride,
    reason: isOverride ? `${prospect.strategicValue} detected — may override tier` : "No strategic override",
  };
};

// ─── STEP 3: Revenue Points ──────────────────────────────────────────────
const getRevenuePoints = (annualRevenue) => {
  const points = REVENUE_POINTS[annualRevenue] || 0;
  return {
    points,
    reason: `${annualRevenue} = ${points} points`,
  };
};

// ─── STEP 4: Industry Multiplier ─────────────────────────────────────────
const getIndustryMultiplier = (primaryIndustry) => {
  const multiplier = INDUSTRY_MULTIPLIER[primaryIndustry] || 1.0;
  const marginLevel =
    multiplier === 1.2 ? "High Margin" : multiplier === 1.0 ? "Standard" : "Low Margin";
  
  return {
    multiplier,
    marginLevel,
    reason: `${primaryIndustry} = ${marginLevel} (×${multiplier})`,
  };
};

// ─── MAIN: Calculate Final Score ────────────────────────────────────────
const calculateFinalScore = (prospect) => {
  const steps = [];
  const metadata = {};

  // Step 1: Tech Fit Check (BLOCKER)
  const techFitResult = validateTechFit(prospect.financialCapacity || "Core Match");
  if (!techFitResult.isValid) {
    return {
      finalScore: 0,
      tier: null,
      status: "disqualified",
      disqualificationReason: "Tech Stack Incompatible",
      metadata: {
        ...metadata,
        techFitMultiplier: 0.0,
        disqualificationReason: techFitResult.reason,
      },
      steps: [`Step 1: Tech Fit Check → FAIL (${techFitResult.reason})`, "Result: DISQUALIFIED"],
    };
  }
  steps.push(`Step 1: Tech Fit Check → PASS (${techFitResult.reason})`);
  metadata.techFitMultiplier = techFitResult.multiplier;

  // Step 2: Strategic Override
  const strategicResult = applyStrategicBonus(prospect);
  steps.push(`Step 2: Strategic Override → ${strategicResult.reason}`);

  // Step 3: Revenue Points
  const revenueResult = getRevenuePoints(prospect.annualRevenue || "Seed <$1M");
  steps.push(`Step 3: Revenue → ${revenueResult.reason}`);
  metadata.revenuePoints = revenueResult.points;

  // Step 4: Industry Multiplier
  const industryResult = getIndustryMultiplier(prospect.primaryIndustry || "Manufacturing");
  steps.push(`Step 4: Industry → ${industryResult.reason}`);
  metadata.industryMultiplier = industryResult.multiplier;

  // Calculate: ((Revenue + Strategy) × Industry) × Tech_Fit
  const baseScore = revenueResult.points + strategicResult.bonus;
  const adjustedScore = baseScore * industryResult.multiplier;
  const finalScore = Math.round(adjustedScore * techFitResult.multiplier);

  steps.push(
    `Calculation: (${revenueResult.points} + ${strategicResult.bonus}) × ${industryResult.multiplier} × ${techFitResult.multiplier} = ${finalScore}`
  );

  metadata.strategyBonus = strategicResult.bonus;
  metadata.finalScore = finalScore;
  metadata.calculatedAt = new Date();

  return {
    finalScore: Math.max(0, Math.min(100, finalScore)), // Clamp 0-100
    metadata,
    steps,
    status: "active",
  };
};

// ─── Assign Tier based on Score ──────────────────────────────────────────
const assignTierFromScore = (finalScore) => {
  if (finalScore >= TIER_BUCKETS.A.min) {
    return {
      tier: "Tier-A (Strategic)",
      assignment: `Score ${finalScore} ≥ 60 → Tier A (Strategic/Whale)`,
      resourceAllocation: "VP/Senior AE + ABM (100% manual)",
    };
  }
  if (finalScore >= TIER_BUCKETS.B.min && finalScore < TIER_BUCKETS.A.min) {
    return {
      tier: "Tier-B (Core)",
      assignment: `Score ${finalScore} in 30-59 → Tier B (Workhorse)`,
      resourceAllocation: "SDR Team + Standard Sequence",
    };
  }
  return {
    tier: "Tier-C (Mass)",
    assignment: `Score ${finalScore} < 30 → Tier C (Long Tail)`,
    resourceAllocation: "Marketing Automation Only (no manual outreach)",
  };
};

// ─── Get Intent Level from Signal ────────────────────────────────────────
const getIntentLevel = (intentSignal) => {
  return INTENT_LEVELS[intentSignal] || "Low";
};

// ─── Assign Priority from Tier + Intent ─────────────────────────────────
const assignPriorityFromTierAndIntent = (tier, intentSignal) => {
  const intentLevel = getIntentLevel(intentSignal);
  const isHighIntent = intentLevel === "High";

  if (tier === "Tier-A (Strategic)" && isHighIntent) {
    return {
      priority: "P1 (Tier A+Active)",
      bucket: "War Room",
      slaMinutes: 30,
      description: "Drop everything. Executive call immediately.",
      action: "Principal Consultant intervention",
    };
  }

  if (tier === "Tier-B (Core)" && isHighIntent) {
    return {
      priority: "P2 (Tier B+Active)",
      bucket: "Fast Cash",
      slaMinutes: 120,
      description: "Fast cash. SDR blitz.",
      action: "Standard SDR qualification sequence",
    };
  }

  if (tier === "Tier-A (Strategic)" && !isHighIntent) {
    return {
      priority: "P3 (Tier A+Cold)",
      bucket: "Long Game",
      slaMinutes: null,
      description: "Hunter's ground. Bespoke research & nurture.",
      action: "Deep work—1-2 hour research per week",
    };
  }

  if (tier === "Tier-B (Core)" && !isHighIntent) {
    return {
      priority: "P4 (Tier B+Cold)",
      bucket: "Fill Gaps",
      slaMinutes: null,
      description: "Volume game. Automated sequences.",
      action: "Power hour—Outreach/Salesloft",
    };
  }

  // Tier C
  return {
    priority: "P5 (Mass)",
    bucket: "Routing Only",
    slaMinutes: null,
    description: "Do not call. Marketing automation only.",
    action: "Self-serve + automated email drips",
  };
};

// ─── Map History Trigger to Intent Signal ────────────────────────────────
const mapHistoryToIntent = (historyTrigger) => {
  const mapping = {
    "M&A Activity": "Integration",
    "Capital Event": "Hyper-Growth Mode",
    "Leadership Shakeup": "Modernization Mandate",
    "Regulatory Action": "Risk Mitigation",
    "Earnings Shock": "Cost Containment",
    "Security Incident": "Risk Mitigation",
    "Strategic Pivot": "Modernization Mandate",
    "Job Postings": "Hyper-Growth Mode",
  };
  return mapping[historyTrigger] || null;
};

// ─── Map Intent Signal to Service Pitch ──────────────────────────────────
const generateServicePitch = (intentSignal) => {
  const pitchMap = {
    "Hyper-Growth Mode": "Speed & Capacity",
    "Cost Containment": "Automation & Outsourcing",
    "Risk Mitigation": "Security & Compliance",
    "Modernization Mandate": "Future-Proofing",
    "Integration": "Data Unification",
  };
  return pitchMap[intentSignal] || null;
};

// ─── EXPORT ──────────────────────────────────────────────────────────────
export default {
  calculateFinalScore,
  assignTierFromScore,
  assignPriorityFromTierAndIntent,
  getIntentLevel,
  mapHistoryToIntent,
  generateServicePitch,
  validateTechFit,
  applyStrategicBonus,
  getRevenuePoints,
  getIndustryMultiplier,
};
