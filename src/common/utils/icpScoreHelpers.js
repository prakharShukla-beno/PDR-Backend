/**
 * Pure helpers for ICP match score persistence (tier, priority, update payload).
 */

export const ALIGNMENT_TO_SCORE = {
  "Core Match":     95,
  "Adjacent Match": 82,
  "No Match":       20,
};

/**
 * Get Tech Fit multiplier from Tech Fit Score (0-100)
 *   90-100 → Core Match    → ×1.0
 *   79-89  → Addressable   → ×0.8
 *   50-60  → Stretch       → ×0.5
 *   0-49   → Incompatible  → ×0.0
 */
export const getTechFitMultiplier = (techFitScore) => {
  if (techFitScore === null || techFitScore === undefined) {
    return { multiplier: 1.0, band: "Unknown" };
  }
  if (techFitScore >= 90) return { multiplier: 1.0, band: "Core Match" };
  if (techFitScore >= 79) return { multiplier: 0.8, band: "Addressable" };
  if (techFitScore >= 50) return { multiplier: 0.5, band: "Stretch" };
  return { multiplier: 0.0, band: "Incompatible" };
};

/**
 * Resolve Tech Fit score for ICP final score calculation.
 *   1. technologyAlignment (Gemini enrich — most accurate)
 *   2. Fresh ICP tech-section score (tool overlap normalized 0–100)
 *   3. Persisted techFitScoreIcp only when alignment is set (enrichment backup)
 */
export const resolveTechFitScore = (prospect, icpSectionTechFitScore) => {
  const alignment = prospect?.technologyAlignment;

  if (alignment && ALIGNMENT_TO_SCORE[alignment] !== undefined) {
    return ALIGNMENT_TO_SCORE[alignment];
  }

  if (icpSectionTechFitScore !== null && icpSectionTechFitScore !== undefined) {
    return icpSectionTechFitScore;
  }

  if (
    alignment &&
    prospect?.techFitScoreIcp !== null &&
    prospect?.techFitScoreIcp !== undefined
  ) {
    return prospect.techFitScoreIcp;
  }

  return null;
};

/**
 * Derive ICP Tier from Final Score (ICP Match × Tech Fit multiplier)
 */
export const getIcpTier = (finalScore) => {
  if (finalScore === null || finalScore === undefined) {
    return null;
  }
  if (finalScore > 60) return "Tier A";
  if (finalScore >= 30) return "Tier B";
  return "Tier C";
};

const ACTIVE_INTENT_SIGNALS = new Set([
  "Hyper-Growth Mode",
  "Digital Transformation",
  "Hiring Surge",
  "Expansion Mode",
  "Modernization Mandate",
  "Job Postings",
  "Strategic Pivot",
]);

export const isActiveIntent = (intentSignal) => {
  if (!intentSignal) return false;
  return ACTIVE_INTENT_SIGNALS.has(intentSignal);
};

export const getIcpSalesPriority = (icpTier, intentSignal) => {
  if (!icpTier) return null;

  const active = isActiveIntent(intentSignal);

  if (icpTier === "Tier A") return active ? "P1" : "P3";
  if (icpTier === "Tier B") return active ? "P2" : "P4";
  return null;
};

export const buildIcpScoreUpdate = ({
  icpMatchScore,
  techFitScore,
  breakdown,
  intentSignal,
  benchmarkIcpId,
}) => {
  const { multiplier, band } = getTechFitMultiplier(techFitScore);

  const icpFinalScore = icpMatchScore !== null && icpMatchScore !== undefined
    ? Math.round(icpMatchScore * multiplier)
    : null;

  const icpTier = getIcpTier(icpFinalScore);
  const icpSalesPriority = getIcpSalesPriority(icpTier, intentSignal);

  return {
    icpMatchScore,
    techFitScoreIcp: techFitScore ?? null,
    techFitBand:     band === "Unknown" ? null : band,
    icpFinalScore,
    icpScoreBreakdown: {
      firmographic: breakdown?.firmographic?.score ?? null,
      market:       breakdown?.market?.score ?? null,
      tech:         breakdown?.tech?.score ?? null,
      persona:      breakdown?.persona?.score ?? null,
    },
    icpTier,
    icpSalesPriority,
    salesPriority:   icpSalesPriority,
    icpBenchmarkRef: benchmarkIcpId || null,
    icpScoredAt:     new Date(),
    icpScoreStale:   false,
  };
};
