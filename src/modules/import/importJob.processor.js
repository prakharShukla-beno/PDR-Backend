import ImportJob from "./importJob.model.js";
import StagedRow from "./stagedRow.model.js";
import Prospect from "../prospect/prospect.model.js";
import Contact from "../contacts/contact.model.js";
import contactRepository from "../contacts/contact.repository.js";
import {
  validateAndNormalizeRow,
} from "../../common/utils/excelParser.js";
import {
  buildContactDocs,
  hasContactPayload,
} from "../../common/utils/contactImportHelpers.js";
import { calculateScore } from "../../common/utils/scoring.js";
import {
  scoreManyProspects,
  getBenchmarkIcp,
} from "../../common/services/icpScoreService.js";
import { normEmail } from "../../common/utils/contactDedup.js";

const CHUNK_SIZE = 500;
const CANCEL_CHECK_INTERVAL_MS = 500;
const TERMINAL_STATUSES = ["completed", "completed_with_errors", "failed", "cancelled"];
const ACTIVE_STATUSES = ["pending", "parsing", "processing"];

export const isJobCancelled = async (jobId) => {
  const job = await ImportJob.findById(jobId)
    .select("status cancelRequested")
    .lean();
  return job?.status === "cancelled" || job?.cancelRequested === true;
};

export const cancelImportJobIfRequested = async (jobId) => {
  if (!(await isJobCancelled(jobId))) return false;

  await ImportJob.findOneAndUpdate(
    { _id: jobId, status: { $nin: TERMINAL_STATUSES } },
    {
      $set: {
        status: "cancelled",
        cancelRequested: true,
        completedAt: new Date(),
      },
    }
  );

  await StagedRow.deleteMany({ jobId, processed: false });
  console.log(`Import job ${jobId} was cancelled by user`);
  return true;
};

/** Run synchronous buffer parse while polling for cancellation */
export const parseExcelFileWithCancel = (jobId, buffer, parseExcelFile) =>
  new Promise((resolve, reject) => {
    let settled = false;

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      handler(value);
    };

    const interval = setInterval(() => {
      cancelImportJobIfRequested(jobId)
        .then((cancelled) => {
          if (cancelled) finish(resolve, null);
        })
        .catch((err) => finish(reject, err));
    }, CANCEL_CHECK_INTERVAL_MS);

    setImmediate(() => {
      try {
        const result = parseExcelFile(buffer);
        finish(resolve, result);
      } catch (err) {
        finish(reject, err);
      }
    });
  });

const prepareProspectDoc = (normalizedRow, companyId) => {
  const { contacts, ...prospectData } = normalizedRow;
  return {
    ...prospectData,
    companyId,
    accountNameLower: prospectData.accountName
      ? prospectData.accountName.toLowerCase().trim()
      : null,
    isDuplicate: false,
    source: "excel",
  };
};

const buildExistingMaps = (prospects = []) => {
  const byName = new Map();
  const byWebsite = new Map();

  for (const prospect of prospects) {
    if (prospect.accountNameLower) {
      byName.set(prospect.accountNameLower, prospect);
    }
    if (prospect.website) {
      byWebsite.set(prospect.website.toLowerCase(), prospect);
    }
  }

  return { byName, byWebsite };
};

const findExistingProspect = (normalizedRow, existingMaps, seenInJob) => {
  const nameKey = normalizedRow.accountName?.toLowerCase().trim();
  const websiteKey = normalizedRow.website?.toLowerCase().trim();

  if (nameKey && existingMaps.byName.has(nameKey)) {
    return { type: "db", prospect: existingMaps.byName.get(nameKey) };
  }
  if (websiteKey && existingMaps.byWebsite.has(websiteKey)) {
    return { type: "db", prospect: existingMaps.byWebsite.get(websiteKey) };
  }
  if (nameKey && seenInJob.names.has(nameKey)) {
    return { type: "in_job", nameKey, websiteKey };
  }
  if (websiteKey && seenInJob.websites.has(websiteKey)) {
    return { type: "in_job", nameKey, websiteKey };
  }

  return null;
};

const registerInJobKeys = (normalizedRow, seenInJob) => {
  const nameKey = normalizedRow.accountName?.toLowerCase().trim();
  const websiteKey = normalizedRow.website?.toLowerCase().trim();
  if (nameKey) seenInJob.names.add(nameKey);
  if (websiteKey) seenInJob.websites.add(websiteKey);
};

const insertProspectsBulk = async (docs) => {
  if (!docs.length) return [];

  try {
    return await Prospect.insertMany(docs, { ordered: false });
  } catch (err) {
    if (err.insertedDocs?.length) return err.insertedDocs;
    if (err.name === "BulkWriteError") {
      const inserted = err.result?.insertedCount ?? 0;
      if (inserted > 0) {
        const ids = Object.values(err.result?.insertedIds ?? {});
        return Prospect.find({ _id: { $in: ids } }).lean();
      }
    }
    throw err;
  }
};

const insertContactsBulk = async (docs) => {
  if (!docs.length) return 0;

  try {
    const result = await contactRepository.insertMany(docs);
    return result?.insertedCount ?? docs.length;
  } catch (err) {
    if (err.name === "BulkWriteError" || err.result) {
      return err.result?.insertedCount ?? err.result?.nInserted ?? 0;
    }
    console.error("Contact bulk insert error:", err.message);
    return 0;
  }
};

const collectContactsForProspect = async ({
  row,
  prospect,
  jobId,
  companyId,
  emailCache,
}) => {
  if (!row.contacts?.length || !hasContactPayload(row.contacts[0])) {
    return [];
  }

  const docs = buildContactDocs(
    row,
    { ...prospect, companyId },
    jobId,
    "account_import"
  );

  const toInsert = [];
  for (const doc of docs) {
    if (await isJobCancelled(jobId)) return [];

    if (!doc.email) {
      toInsert.push(doc);
      continue;
    }

    const email = normEmail(doc.email);
    const cacheKey = `${prospect._id}:${email}`;
    if (emailCache.has(cacheKey)) continue;

    const exists = await Contact.findOne({
      accountId: prospect._id,
      companyId,
      email,
    }).select("_id").lean();

    if (exists) {
      emailCache.add(cacheKey);
      continue;
    }

    emailCache.add(cacheKey);
    toInsert.push(doc);
  }

  return toInsert;
};

export const processImportJob = async (jobId, companyId, userId) => {
  let successCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;
  const errorSamples = [];
  const insertedProspectIds = [];
  const seenInJob = { names: new Set(), websites: new Set() };
  const emailCache = new Set();

  let hasMore = true;

  while (hasMore) {
    if (await cancelImportJobIfRequested(jobId)) return;

    const chunk = await StagedRow.find({
      jobId,
      processed: false,
    })
      .sort({ rowIndex: 1 })
      .limit(CHUNK_SIZE)
      .lean();

    if (chunk.length === 0) {
      hasMore = false;
      break;
    }

    const validated = [];

    for (const stagedRow of chunk) {
      try {
        const { isValid, normalizedRow, reason } = validateAndNormalizeRow(
          stagedRow.rawData,
          stagedRow.rowIndex + 2
        );

        if (!isValid) {
          errorCount++;
          if (errorSamples.length < 20) {
            errorSamples.push({
              row: stagedRow.rowIndex + 2,
              reason: reason || "Validation failed",
            });
          }
          continue;
        }

        validated.push({ stagedRow, normalizedRow });
      } catch (err) {
        errorCount++;
        if (errorSamples.length < 20) {
          errorSamples.push({
            row: stagedRow.rowIndex + 2,
            reason: err.message,
          });
        }
      }
    }

    const accountNames = validated
      .map((v) => v.normalizedRow.accountName?.toLowerCase().trim())
      .filter(Boolean);
    const websites = validated
      .map((v) => v.normalizedRow.website?.toLowerCase().trim())
      .filter(Boolean);

    const existingProspects = accountNames.length || websites.length
      ? await Prospect.find({
          companyId,
          $or: [
            ...(accountNames.length
              ? [{ accountNameLower: { $in: accountNames } }]
              : []),
            ...(websites.length ? [{ website: { $in: websites } }] : []),
          ],
        })
          .select("_id accountName accountNameLower website primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal")
          .lean()
      : [];

    const existingMaps = buildExistingMaps(existingProspects);
    const prospectsToInsert = [];
    const deferredContacts = [];

    for (const { stagedRow, normalizedRow } of validated) {
      const duplicate = findExistingProspect(normalizedRow, existingMaps, seenInJob);
      const nameKey = normalizedRow.accountName?.toLowerCase().trim();
      const websiteKey = normalizedRow.website?.toLowerCase().trim();

      if (duplicate) {
        duplicateCount++;

        if (duplicate.type === "db") {
          deferredContacts.push({
            row: normalizedRow,
            nameKey,
            websiteKey,
            prospect: duplicate.prospect,
          });
        } else {
          deferredContacts.push({
            row: normalizedRow,
            nameKey,
            websiteKey,
            prospect: null,
          });
        }
        continue;
      }

      registerInJobKeys(normalizedRow, seenInJob);
      prospectsToInsert.push({
        stagedRow,
        normalizedRow,
        doc: prepareProspectDoc(normalizedRow, companyId),
        nameKey,
        websiteKey,
      });
    }

    let insertedProspects = [];
    if (prospectsToInsert.length > 0) {
      if (await cancelImportJobIfRequested(jobId)) return;

      insertedProspects = await insertProspectsBulk(
        prospectsToInsert.map((item) => item.doc)
      );
      successCount += insertedProspects.length;
      insertedProspectIds.push(...insertedProspects.map((p) => p._id));

      for (const prospect of insertedProspects) {
        if (prospect.accountNameLower) {
          existingMaps.byName.set(prospect.accountNameLower, prospect);
        }
        if (prospect.website) {
          existingMaps.byWebsite.set(prospect.website.toLowerCase(), prospect);
        }
      }
    }

    const resolveProspectForContact = (entry) => {
      if (entry.prospect?._id) return entry.prospect;

      if (entry.nameKey && existingMaps.byName.has(entry.nameKey)) {
        return existingMaps.byName.get(entry.nameKey);
      }
      if (entry.websiteKey && existingMaps.byWebsite.has(entry.websiteKey)) {
        return existingMaps.byWebsite.get(entry.websiteKey);
      }
      return null;
    };

    const contactsToInsert = [];
    for (const entry of deferredContacts) {
      if (await cancelImportJobIfRequested(jobId)) return;

      const prospect = resolveProspectForContact(entry);
      if (!prospect) continue;

      const docs = await collectContactsForProspect({
        row: entry.row,
        prospect,
        jobId,
        companyId,
        emailCache,
      });
      contactsToInsert.push(...docs);
    }

    for (const { normalizedRow, nameKey } of prospectsToInsert) {
      if (await cancelImportJobIfRequested(jobId)) return;

      const prospect = nameKey ? existingMaps.byName.get(nameKey) : null;
      if (!prospect) continue;

      const docs = await collectContactsForProspect({
        row: normalizedRow,
        prospect,
        jobId,
        companyId,
        emailCache,
      });
      contactsToInsert.push(...docs);
    }

    if (contactsToInsert.length > 0) {
      if (await cancelImportJobIfRequested(jobId)) return;
      await insertContactsBulk(contactsToInsert);
    }

    if (await cancelImportJobIfRequested(jobId)) return;

    const chunkIds = chunk.map((r) => r._id);
    await StagedRow.updateMany(
      { _id: { $in: chunkIds } },
      { processed: true }
    );

    await ImportJob.findOneAndUpdate(
      { _id: jobId, status: "processing" },
      {
        $inc: { processedRows: chunk.length },
        successCount,
        duplicateCount,
        errorCount,
        errorSamples,
      }
    );
  }

  if (await cancelImportJobIfRequested(jobId)) return;

  const jobState = await ImportJob.findById(jobId)
    .select("status cancelRequested")
    .lean();

  if (jobState?.status === "cancelled" || jobState?.cancelRequested) {
    return;
  }

  const finalStatus = errorCount > 0 ? "completed_with_errors" : "completed";

  await ImportJob.findOneAndUpdate(
    { _id: jobId, status: "processing" },
    {
      status: finalStatus,
      successCount,
      duplicateCount,
      errorCount,
      errorSamples,
      completedAt: new Date(),
    }
  );

  await StagedRow.deleteMany({ jobId });

  if (insertedProspectIds.length > 0) {
    try {
      const newProspects = await Prospect.find({
        _id: { $in: insertedProspectIds },
      }).lean();

      const scoringUpdates = [];

      for (const prospect of newProspects) {
        try {
          const scoreResult = calculateScore(prospect);
          scoringUpdates.push({
            updateOne: {
              filter: { _id: prospect._id },
              update: {
                $set: {
                  finalScore: scoreResult.finalScore,
                  clvRanking: scoreResult.clvRanking,
                  salesPriority: scoreResult.salesPriority,
                  techFitScore: scoreResult.techFitScore,
                },
              },
            },
          });
        } catch (scoreErr) {
          console.warn(
            `Post-import scoring skipped for ${prospect.accountName || prospect._id}:`,
            scoreErr.message
          );
        }
      }

      if (scoringUpdates.length > 0) {
        await Prospect.bulkWrite(scoringUpdates, { ordered: false });
      }
    } catch (err) {
      console.error("Post-import scoring error:", err.message);
    }

    // ── ICP Score new prospects ──────────────────────────────────────────────
    try {
      if (insertedProspectIds.length > 0) {
        const benchmarkIcp = await getBenchmarkIcp(companyId);

        if (benchmarkIcp) {
          const newIds = insertedProspectIds.map((id) => id.toString());
          const icpResult = await scoreManyProspects(
            newIds,
            companyId,
            benchmarkIcp
          );
          console.log(
            `Post-import ICP scoring: ` +
            `${icpResult.scored}/${icpResult.total} scored`
          );
        } else {
          await Prospect.updateMany(
            { _id: { $in: insertedProspectIds } },
            { $set: { icpScoreStale: true } }
          );
          console.log(
            `Post-import: no benchmark ICP — ` +
            `${insertedProspectIds.length} prospects marked stale`
          );
        }
      }
    } catch (err) {
      console.error("Post-import ICP scoring failed:", err.message);
    }
    // ── end ICP scoring ────────────────────────────────────────────────────
  }

  console.log(
    `Import job ${jobId} complete: ${successCount} created, ` +
    `${duplicateCount} duplicates, ${errorCount} errors`
  );

  return { successCount, duplicateCount, errorCount };
};

export default processImportJob;
