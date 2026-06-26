import Prospect from "../../modules/prospect/prospect.model.js";
import ICP from "../../modules/icp/icp.model.js";
import Contact from "../../modules/contacts/contact.model.js";
import { calculateIcpMatchScore } from "../utils/icpScoring.js";
import { buildIcpScoreUpdate, resolveTechFitScore } from "../utils/icpScoreHelpers.js";

const BATCH_SIZE = 200;

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
 * Get the benchmark ICP for a company.
 * Returns null if no benchmark is set.
 */
export const getBenchmarkIcp = async (companyId) => {
  return await ICP.findOne({
    companyId,
    isBenchmark: true,
    isActive: true,
  }).lean();
};

/**
 * Calculate and save ICP score for a SINGLE prospect.
 * Used after: single AI enrichment, single account create.
 */
export const scoreOneProsect = async (
  prospectId,
  companyId,
  benchmarkIcp = null
) => {
  const icp = benchmarkIcp || await getBenchmarkIcp(companyId);

  if (!icp) {
    await Prospect.findByIdAndUpdate(prospectId, {
      icpMatchScore:    null,
      icpFinalScore:    null,
      techFitScoreIcp:  null,
      techFitBand:      null,
      icpTier:          null,
      icpSalesPriority: null,
      icpScoreStale:    true,
      salesPriority:    null,
    });
    return { skipped: true, reason: "No benchmark ICP" };
  }

  const prospect = await Prospect.findOne({
    _id: prospectId,
    companyId,
  }).lean();

  if (!prospect) {
    return { skipped: true, reason: "Prospect not found" };
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
 * Used after: Excel import (batch), Re-Tier All.
 */
export const scoreManyProspects = async (
  prospectIds,
  companyId,
  benchmarkIcp = null
) => {
  const icp = benchmarkIcp || await getBenchmarkIcp(companyId);

  if (!icp) {
    await Prospect.updateMany(
      { _id: { $in: prospectIds }, companyId },
      {
        $set: {
          icpMatchScore:    null,
          icpFinalScore:    null,
          techFitScoreIcp:  null,
          techFitBand:      null,
          icpTier:          null,
          icpSalesPriority: null,
          icpScoreStale:    true,
          salesPriority:    null,
        },
      }
    );
    return {
      scored:  0,
      skipped: prospectIds.length,
      total:   prospectIds.length,
      reason:  "No benchmark ICP set",
    };
  }

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

          console.log(
            `Scoring ${prospect.accountName}: ` +
            `ICP=${scoreResult.icpMatchScore}, ` +
            `TechFit=${techFitScore}, ` +
            `Final=${update.icpFinalScore}`
          );

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
 * Score ALL prospects for a company (Re-Tier All).
 */
export const scoreAllProspectsForCompany = async (companyId) => {
  const icp = await getBenchmarkIcp(companyId);

  const prospects = await Prospect.find({ companyId })
    .select("_id")
    .lean();

  const prospectIds = prospects.map((p) => p._id.toString());

  if (prospectIds.length === 0) {
    return { scored: 0, skipped: 0, total: 0 };
  }

  console.log(
    `Re-Tier All: scoring ${prospectIds.length} ` +
    `prospects for company ${companyId}`
  );

  return await scoreManyProspects(prospectIds, companyId, icp);
};

/**
 * Mark ALL prospects for a company as stale (or rescore immediately).
 */
export const invalidateIcpScores = async (
  companyId,
  rescoreImmediately = false
) => {
  if (rescoreImmediately) {
    await scoreAllProspectsForCompany(companyId);
  } else {
    await Prospect.updateMany(
      { companyId },
      { $set: { icpScoreStale: true } }
    );
    console.log(
      `ICP scores marked stale for company ${companyId}`
    );
  }
};
