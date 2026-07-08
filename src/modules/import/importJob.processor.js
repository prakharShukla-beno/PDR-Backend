import ImportJob from "./importJob.model.js";
import StagedRow from "./stagedRow.model.js";
import Prospect from "../prospect/prospect.model.js";
import Contact from "../contacts/contact.model.js";
import contactRepository from "../contacts/contact.repository.js";
import duplicateRepository from "../duplicate/duplicate.repository.js";
import {
  validateAndNormalizeRow,
} from "../../common/utils/excelParser.js";
import {
  buildContactDocs,
  hasContactPayload,
} from "../../common/utils/contactImportHelpers.js";
import { calculateScore } from "../../common/utils/scoring.js";
import {
  buildContactDedupIndexes,
  findDbContactDuplicate,
  registerInFileRow,
  createInFileDedupTracker,
  checkInFileDuplicate,
  normEmail,
  normPhone,
  nameAccountKey,
} from "../../common/utils/contactDedup.js";
import { companyObjectId } from "../../common/utils/tenantScope.js";

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

const buildAccountDuplicateMatchFields = (normalizedRow, existingMaps, seenInJob, duplicate) => {
  const nameKey = normalizedRow.accountName?.toLowerCase().trim();
  const websiteKey = normalizedRow.website?.toLowerCase().trim();
  const matchFields = [];

  if (duplicate.type === "db") {
    if (nameKey && existingMaps.byName.has(nameKey)) matchFields.push("accountName");
    if (websiteKey && existingMaps.byWebsite.has(websiteKey)) matchFields.push("website");
  } else {
    if (nameKey && seenInJob.names.has(nameKey)) matchFields.push("accountName");
    else if (websiteKey && seenInJob.websites.has(websiteKey)) matchFields.push("website");
  }

  return matchFields.length ? matchFields : ["accountName"];
};

const buildAccountDuplicateRecord = ({
  prospectId,
  normalizedRow,
  matchFields,
  companyId,
}) => {
  const { contacts, ...prospectData } = normalizedRow;
  return {
    prospectId1: prospectId,
    entityType: "Prospect",
    newData: { ...prospectData, contacts },
    matchFields,
    source: "import",
    status: "pending",
    companyId: companyObjectId(companyId),
  };
};

const resolveProspectId = (prospect) => prospect?._id ?? prospect?.id ?? null;

const persistAccountDuplicateRecords = async (records) => {
  if (!records.length) return 0;

  try {
    await duplicateRepository.insertMany(records);
    return records.length;
  } catch (err) {
    console.warn(
      `Import duplicate bulk insert issue (${records.length} records): ${err.message}`
    );

    let saved = 0;
    for (const record of records) {
      try {
        await duplicateRepository.create(record);
        saved++;
      } catch (createErr) {
        if (createErr?.code === 11000) {
          saved++;
          continue;
        }
        console.error(
          `Import duplicate insert failed for account "${record.newData?.accountName ?? "?"}":`,
          createErr.message
        );
      }
    }
    return saved;
  }
};

const createContactDuplicateRecord = async ({
  contactId,
  contact,
  matchFields,
  companyId,
}) => {
  await duplicateRepository.create({
    prospectId1: contactId,
    entityType: "Contact",
    newData: contact,
    matchFields,
    source: "import",
    status: "pending",
    companyId: companyObjectId(companyId),
  });
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
  contactDedupIndexes,
  inFileContactTracker,
  deferredInFileContactDups,
}) => {
  if (!row.contacts?.length || !hasContactPayload(row.contacts[0])) {
    return { docs: [], duplicateCount: 0 };
  }

  const docs = buildContactDocs(
    row,
    { ...prospect, companyId },
    jobId,
    "account_import"
  );

  const toInsert = [];
  let duplicateCount = 0;

  for (const doc of docs) {
    if (await isJobCancelled(jobId)) return { docs: [], duplicateCount };

    const email = doc.email ? normEmail(doc.email) : null;
    const cacheKey = email ? `${prospect._id}:${email}` : null;

    if (email && cacheKey && emailCache.has(cacheKey)) {
      duplicateCount++;
      continue;
    }

    if (email) {
      const existsOnAccount = await Contact.findOne({
        accountId: prospect._id,
        companyId,
        email,
      }).select("_id").lean();

      if (existsOnAccount) {
        await createContactDuplicateRecord({
          contactId: existsOnAccount._id,
          contact: doc,
          matchFields: ["email"],
          companyId,
        });
        emailCache.add(cacheKey);
        duplicateCount++;
        continue;
      }
    }

    const dbDup = findDbContactDuplicate(doc, contactDedupIndexes);
    if (dbDup) {
      await createContactDuplicateRecord({
        contactId: dbDup.existing._id,
        contact: doc,
        matchFields: dbDup.matchFields,
        companyId,
      });
      if (cacheKey) emailCache.add(cacheKey);
      duplicateCount++;
      continue;
    }

    const inFileDup = checkInFileDuplicate(doc, inFileContactTracker);
    if (inFileDup) {
      deferredInFileContactDups.push({
        contact: doc,
        matchFields: inFileDup.matchFields,
        firstRowData: inFileDup.firstRow,
      });
      duplicateCount++;
      continue;
    }

    registerInFileRow(doc, inFileContactTracker);
    if (cacheKey) emailCache.add(cacheKey);
    toInsert.push(doc);
  }

  return { docs: toInsert, duplicateCount };
};

export const processImportJob = async (jobId, companyId, userId) => {
  let successCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;
  const errorSamples = [];
  const insertedProspectIds = [];
  const seenInJob = { names: new Set(), websites: new Set() };
  const emailCache = new Set();
  const inFileContactTracker = createInFileDedupTracker();
  const deferredInFileContactDups = [];

  const existingMaps = buildExistingMaps(
    await Prospect.find({ companyId })
      .select(
        "_id accountName accountNameLower website primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal"
      )
      .lean()
  );

  const existingContacts = await Contact.find({ companyId })
    .select("_id email primaryPhone firstName lastName accountName")
    .lean();
  const contactDedupIndexes = buildContactDedupIndexes(existingContacts);

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

    const prospectsToInsert = [];
    const deferredContacts = [];
    const pendingInJobDuplicates = [];
    const accountDuplicateRecords = [];

    for (const { stagedRow, normalizedRow } of validated) {
      const duplicate = findExistingProspect(normalizedRow, existingMaps, seenInJob);
      const nameKey = normalizedRow.accountName?.toLowerCase().trim();
      const websiteKey = normalizedRow.website?.toLowerCase().trim();

      if (duplicate) {
        duplicateCount++;
        const matchFields = buildAccountDuplicateMatchFields(
          normalizedRow,
          existingMaps,
          seenInJob,
          duplicate
        );

        const existingProspectId = resolveProspectId(duplicate.prospect);
        if (duplicate.type === "db" && existingProspectId) {
          accountDuplicateRecords.push(
            buildAccountDuplicateRecord({
              prospectId: existingProspectId,
              normalizedRow,
              matchFields,
              companyId,
            })
          );
        } else {
          pendingInJobDuplicates.push({
            normalizedRow,
            nameKey,
            websiteKey,
            matchFields,
          });
        }

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

    for (const dup of pendingInJobDuplicates) {
      const existing =
        (dup.nameKey && existingMaps.byName.get(dup.nameKey)) ||
        (dup.websiteKey && existingMaps.byWebsite.get(dup.websiteKey));

      if (!existing?._id) continue;

      accountDuplicateRecords.push(
        buildAccountDuplicateRecord({
          prospectId: existing._id,
          normalizedRow: dup.normalizedRow,
          matchFields: dup.matchFields,
          companyId,
        })
      );
    }

    const savedAccountDups = await persistAccountDuplicateRecords(accountDuplicateRecords);
    if (accountDuplicateRecords.length > 0) {
      console.log(
        `Import job ${jobId}: saved ${savedAccountDups}/${accountDuplicateRecords.length} account duplicate records`
      );
    }
    if (accountDuplicateRecords.length > 0 && savedAccountDups === 0) {
      console.error(
        `Import job ${jobId}: failed to persist ${accountDuplicateRecords.length} account duplicate records`
      );
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

      const result = await collectContactsForProspect({
        row: entry.row,
        prospect,
        jobId,
        companyId,
        emailCache,
        contactDedupIndexes,
        inFileContactTracker,
        deferredInFileContactDups,
      });
      contactsToInsert.push(...result.docs);
      duplicateCount += result.duplicateCount;
    }

    for (const { normalizedRow, nameKey } of prospectsToInsert) {
      if (await cancelImportJobIfRequested(jobId)) return;

      const prospect = nameKey ? existingMaps.byName.get(nameKey) : null;
      if (!prospect) continue;

      const result = await collectContactsForProspect({
        row: normalizedRow,
        prospect,
        jobId,
        companyId,
        emailCache,
        contactDedupIndexes,
        inFileContactTracker,
        deferredInFileContactDups,
      });
      contactsToInsert.push(...result.docs);
      duplicateCount += result.duplicateCount;
    }

    if (contactsToInsert.length > 0) {
      if (await cancelImportJobIfRequested(jobId)) return;
      await insertContactsBulk(contactsToInsert);

      const refreshed = buildContactDedupIndexes(
        await Contact.find({ companyId })
          .select("_id email primaryPhone firstName lastName accountName")
          .lean()
      );
      contactDedupIndexes.byEmail = refreshed.byEmail;
      contactDedupIndexes.byPhone = refreshed.byPhone;
      contactDedupIndexes.byNameAccount = refreshed.byNameAccount;
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

  if (deferredInFileContactDups.length > 0) {
    const insertedContacts = await Contact.find({ companyId })
      .select("_id email primaryPhone firstName lastName accountName")
      .lean();

    const insertedByEmail = {};
    const insertedByPhone = {};
    const insertedByNameAccount = {};

    for (const contact of insertedContacts) {
      const email = normEmail(contact.email);
      if (email) insertedByEmail[email] = contact;

      const phone = normPhone(contact.primaryPhone);
      if (phone) insertedByPhone[phone] = contact;

      const nameKey = nameAccountKey(contact);
      if (nameKey) insertedByNameAccount[nameKey] = contact;
    }

    for (const dup of deferredInFileContactDups) {
      const first = dup.firstRowData;
      const existing =
        (normEmail(first.email) && insertedByEmail[normEmail(first.email)]) ||
        (normPhone(first.primaryPhone) && insertedByPhone[normPhone(first.primaryPhone)]) ||
        (nameAccountKey(first) && insertedByNameAccount[nameAccountKey(first)]);

      if (!existing) continue;

      await createContactDuplicateRecord({
        contactId: existing._id,
        contact: dup.contact,
        matchFields: dup.matchFields,
        companyId,
      });
      duplicateCount++;
    }
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

    // NOTE: No ICP scoring on import. There is no global benchmark ICP —
    // accounts are scored against an ICP only when the user matches them
    // against one / builds a segment from an ICP.
  }

  console.log(
    `Import job ${jobId} complete: ${successCount} created, ` +
    `${duplicateCount} duplicates, ${errorCount} errors`
  );

  return { successCount, duplicateCount, errorCount };
};

export default processImportJob;
