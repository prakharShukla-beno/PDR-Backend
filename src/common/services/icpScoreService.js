import Prospect from "../../modules/prospect/prospect.model.js";
import ICP from "../../modules/icp/icp.model.js";
import Contact from "../../modules/contacts/contact.model.js";
import { calculateIcpMatchScore } from "../utils/icpScoring.js";
import { buildIcpScoreUpdate, resolveTechFitScore } from "../utils/icpScoreHelpers.js";

const BATCH_SIZE = 200;

/** Active benchmark ICP for a company (first active profile). */
export const getBenchmarkIcp = async (companyId) => {
  return await ICP.findOne({ companyId, isActive: true })
    .sort({ createdAt: 1 })
    .lean();
};

/** Sum nested { score } values from an icpScoring pillar breakdown object */
const pillarScore = (pillarBreakdown) => {
  if (!pillarBreakdown || typeof pillarBreakdown !== "object") return null;
  const total = Object.values(pillarBreakdown).reduce(
    (sum, entry) => sum + (entry?.score ?? 0),
    0
  );
  return total;
};

/** Map calculateIcpMatchScore breakdown → buildIcpScoreUpdate shape */
const toPillarBreakdown = (scoreResult) => ({
  firmographic: { score: pillarScore(scoreResult.breakdown.firmographic) },
  market:       { score: pillarScore(scoreResult.breakdown.market) },
  tech:         { score: pillarScore(scoreResult.breakdown.tech) },
  persona:      { score: pillarScore(scoreResult.breakdown.persona) },
});

/**
 * Resolve the ICP a prospect should be scored against.
 * There is NO global benchmark — an account is scored against the ICP it was
 * last matched/segmented with (persisted on prospect.icpBenchmarkRef).
 * Uses a cache to avoid reloading the same ICP repeatedly in bulk operations.
 */
const loadIcpById = async (icpId, companyId, cache) => {
  if (!icpId) return null;
  const key = icpId.toString();
  if (cache && cache.has(key)) return cache.get(key);
  const icp = await ICP.findOne({ _id: icpId, companyId, isActive: true }).lean();
  if (cache) cache.set(key, icp);
  return icp;
};

/**
 * Calculate and save ICP score for a SINGLE prospect.
 * Used after: single AI enrichment, single account create.
 *
 * @param icpOverride - explicit ICP to score against (e.g. a segment's ICP).
 *                      When omitted, falls back to the prospect's last-matched
 *                      ICP (icpBenchmarkRef). If neither exists, scoring is skipped.
 */
export const scoreOneProsect = async (
  prospectId,
  companyId,
  icpOverride = null
) => {
  const prospect = await Prospect.findOne({
    _id: prospectId,
    companyId,
  }).lean();

  if (!prospect) {
    return { skipped: true, reason: "Prospect not found" };
  }

  const icp =
    icpOverride ||
    (await loadIcpById(prospect.icpBenchmarkRef, companyId));

  if (!icp) {
    return { skipped: true, reason: "No ICP context for prospect" };
  }

  const scoreResult = await calculateIcpMatchScore(prospect, icp, Contact);
  const techFitScore = resolveTechFitScore(prospect, scoreResult.techFitScore);

  const update = buildIcpScoreUpdate({
    icpMatchScore:  scoreResult.icpMatchScore,
    techFitScore,
    breakdown:      toPillarBreakdown(scoreResult),
    intentSignal:   prospect.intentSignal,
    benchmarkIcpId: icp._id,
  });

  await Prospect.findByIdAndUpdate(prospectId, { $set: update });

  return {
    skipped:          false,
    icpMatchScore:    update.icpMatchScore,
    icpTier:          update.icpTier,
    icpSalesPriority: update.icpSalesPriority,
  };
};

/**
 * Calculate and save ICP scores for MULTIPLE prospects.
 * Used after: segment creation / Re-Tier.
 *
 * @param icpOverride - explicit ICP to score every prospect against (e.g. a
 *                      segment's source ICP). When omitted, each prospect is
 *                      scored against its own last-matched ICP (icpBenchmarkRef).
 *                      Prospects without any ICP context are skipped.
 */
export const scoreManyProspects = async (
  prospectIds,
  companyId,
  icpOverride = null
) => {
  const icpCache = new Map();
  let scored  = 0;
  let skipped = 0;

  for (let i = 0; i < prospectIds.length; i += BATCH_SIZE) {
    const batchIds = prospectIds.slice(i, i + BATCH_SIZE);

    const prospects = await Prospect.find({
      _id: { $in: batchIds },
      companyId,
    }).lean();

    const batchResults = await Promise.all(
      prospects.map(async (prospect) => {
        try {
          const icp =
            icpOverride ||
            (await loadIcpById(prospect.icpBenchmarkRef, companyId, icpCache));

          if (!icp) {
            return { ok: false, noIcp: true };
          }

          const scoreResult = await calculateIcpMatchScore(
            prospect,
            icp,
            Contact
          );

          const techFitScore = resolveTechFitScore(
            prospect,
            scoreResult.techFitScore
          );

          const update = buildIcpScoreUpdate({
            icpMatchScore:  scoreResult.icpMatchScore,
            techFitScore,
            breakdown:      toPillarBreakdown(scoreResult),
            intentSignal:   prospect.intentSignal,
            benchmarkIcpId: icp._id,
          });

          return {
            ok: true,
            op: {
              updateOne: {
                filter: { _id: prospect._id },
                update: { $set: update },
              },
            },
          };
        } catch (err) {
          console.error(
            `ICP score failed for ${prospect._id}:`,
            err.message
          );
          return { ok: false };
        }
      })
    );

    const bulkOps = batchResults.filter((r) => r.ok).map((r) => r.op);
    scored  += bulkOps.length;
    skipped += batchResults.filter((r) => !r.ok).length;

    if (bulkOps.length > 0) {
      await Prospect.bulkWrite(bulkOps, { ordered: false });
    }

    console.log(
      `ICP scoring batch ${Math.floor(i / BATCH_SIZE) + 1}: ` +
      `${bulkOps.length} scored, running total: ${scored}`
    );
  }

  console.log(
    `ICP scoring complete: ${scored} scored, ` +
    `${skipped} skipped of ${prospectIds.length} total`
  );

  return {
    scored,
    skipped,
    total: prospectIds.length,
  };
};

/**
 * Re-score ALL prospects for a company (Re-Tier All).
 * Each prospect is re-scored against its own last-matched ICP.
 * Prospects that were never matched against any ICP are skipped.
 */
export const scoreAllProspectsForCompany = async (companyId) => {
  const prospects = await Prospect.find({
    companyId,
    icpBenchmarkRef: { $ne: null },
  })
    .select("_id")
    .lean();

  const prospectIds = prospects.map((p) => p._id.toString());

  if (prospectIds.length === 0) {
    return { scored: 0, skipped: 0, total: 0 };
  }

  console.log(
    `Re-Tier All: scoring ${prospectIds.length} ` +
    `prospects for company ${companyId} against their matched ICPs`
  );

  return await scoreManyProspects(prospectIds, companyId);
};
