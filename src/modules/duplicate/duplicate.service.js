import mongoose from "mongoose";
import duplicateRepository from "./duplicate.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";
import contactRepository from "../contacts/contact.repository.js";
import Contact from "../contacts/contact.model.js";
import auditLogService from "../auditLog/auditLog.service.js";
import dashboardService from "../dashboard/dashboard.service.js";
import {
  saveContactsForProspect,
} from "../../common/utils/contactImportHelpers.js";
import { normEmail } from "../../common/utils/contactDedup.js";
import { companyObjectId } from "../../common/utils/tenantScope.js";
import Prospect from "../prospect/prospect.model.js";
import Duplicate from "./duplicate.model.js";

const CONTACT_DUPLICATE_ASYNC_THRESHOLD = 5000;

/**
 * Process contact duplicates synchronously for small datasets (≤5000 records)
 * Uses MongoDB aggregation pipeline for O(n) performance
 */
const processContactDuplicatesSync = async (cid, filter, importLogId) => {
  // Step 1: Find duplicates using aggregation pipeline
  const duplicatesByEmail = await Contact.aggregate([
    { $match: { ...filter, email: { $exists: true, $nin: [null, ""] } } },
    { $project: { _id: 1, email: 1, firstName: 1, lastName: 1, accountName: 1, importLogId: 1 } },
    { $group: {
        _id: { $toLower: "$email" },
        count: { $sum: 1 },
        contacts: { $push: "$$ROOT" }
    }},
    { $match: { count: { $gt: 1 } } }
  ]);

  const duplicatesByPhone = await Contact.aggregate([
    { $match: { ...filter, primaryPhone: { $exists: true, $nin: [null, ""] } } },
    { $project: { _id: 1, primaryPhone: 1, firstName: 1, lastName: 1, accountName: 1, importLogId: 1 } },
    { $group: {
        _id: { $toLower: "$primaryPhone" },
        count: { $sum: 1 },
        contacts: { $push: "$$ROOT" }
    }},
    { $match: { count: { $gt: 1 } } }
  ]);

  // Step 2: Process duplicates with bulk operations
  const contactUpdates = [];
  const duplicateRecords = [];
  const processedIds = new Set();

  // Process email duplicates
  for (const group of duplicatesByEmail) {
    const [existing, ...incoming] = group.contacts;
    for (const c of incoming) {
      if (processedIds.has(c._id.toString())) continue;
      processedIds.add(c._id.toString());

      contactUpdates.push({
        updateOne: { filter: { _id: c._id }, update: { $set: { isDuplicate: true } } }
      });
      duplicateRecords.push({
        prospectId1: existing._id,
        entityType: "Contact",
        newData: { email: c.email, firstName: c.firstName, lastName: c.lastName, accountName: c.accountName },
        matchFields: ["email"],
        source: "import",
        importLogId: c.importLogId || importLogId || null,
        status: "pending",
        companyId: cid,
      });
    }
  }

  // Process phone duplicates
  for (const group of duplicatesByPhone) {
    const [existing, ...incoming] = group.contacts;
    for (const c of incoming) {
      if (processedIds.has(c._id.toString())) continue;
      processedIds.add(c._id.toString());

      contactUpdates.push({
        updateOne: { filter: { _id: c._id }, update: { $set: { isDuplicate: true } } }
      });
      duplicateRecords.push({
        prospectId1: existing._id,
        entityType: "Contact",
        newData: { primaryPhone: c.primaryPhone, firstName: c.firstName, lastName: c.lastName, accountName: c.accountName },
        matchFields: ["primaryPhone"],
        source: "import",
        importLogId: c.importLogId || importLogId || null,
        status: "pending",
        companyId: cid,
      });
    }
  }

  // Step 3: Execute bulk operations
  if (contactUpdates.length > 0) {
    await Contact.bulkWrite(contactUpdates, { ordered: false });
  }
  if (duplicateRecords.length > 0) {
    await Duplicate.insertMany(duplicateRecords, { ordered: false });

    // Step 4: Delete duplicate contacts from collection (move to duplicates page)
    const duplicateContactIds = Array.from(processedIds).map(
      id => new mongoose.Types.ObjectId(id)
    );

    const deleteResult = await Contact.deleteMany({
      _id: { $in: duplicateContactIds }
    });

    console.log(`[ContactDuplicateCheck] Deleted ${deleteResult.deletedCount} duplicate contacts from collection`);
  }

  return {
    checked: await Contact.countDocuments(filter),
    duplicateCount: duplicateRecords.length,
  };
};

/**
 * Process contact duplicates asynchronously for large datasets (5000+ records).
 * Same detection logic as the sync version, but writes happen in batches and
 * the caller does NOT await this — it returns immediately with a
 * "processing" status so the HTTP request never hits a timeout.
 */
const processContactDuplicatesAsync = async (cid, filter, importLogId) => {
  console.log(`[ContactDuplicateCheck] Starting async processing for company ${cid}`);

  try {
    const BATCH_SIZE = 2000;

    const duplicatesByEmail = await Contact.aggregate([
      { $match: { ...filter, email: { $exists: true, $nin: [null, ""] } } },
      { $project: { _id: 1, email: 1, firstName: 1, lastName: 1, accountName: 1, importLogId: 1 } },
      { $group: {
          _id: { $toLower: "$email" },
          count: { $sum: 1 },
          contacts: { $push: "$$ROOT" }
      }},
      { $match: { count: { $gt: 1 } } }
    ]);

    const duplicatesByPhone = await Contact.aggregate([
      { $match: { ...filter, primaryPhone: { $exists: true, $nin: [null, ""] } } },
      { $project: { _id: 1, primaryPhone: 1, firstName: 1, lastName: 1, accountName: 1, importLogId: 1 } },
      { $group: {
          _id: { $toLower: "$primaryPhone" },
          count: { $sum: 1 },
          contacts: { $push: "$$ROOT" }
      }},
      { $match: { count: { $gt: 1 } } }
    ]);

    const contactUpdates = [];
    const duplicateRecords = [];
    const processedIds = new Set();

    for (const group of duplicatesByEmail) {
      const [existing, ...incoming] = group.contacts;
      for (const c of incoming) {
        if (processedIds.has(c._id.toString())) continue;
        processedIds.add(c._id.toString());

        contactUpdates.push({
          updateOne: { filter: { _id: c._id }, update: { $set: { isDuplicate: true } } }
        });
        duplicateRecords.push({
          prospectId1: existing._id,
          entityType: "Contact",
          newData: { email: c.email, firstName: c.firstName, lastName: c.lastName, accountName: c.accountName },
          matchFields: ["email"],
          source: "import",
          importLogId: c.importLogId || importLogId || null,
          status: "pending",
          companyId: cid,
        });
      }
    }

    for (const group of duplicatesByPhone) {
      const [existing, ...incoming] = group.contacts;
      for (const c of incoming) {
        if (processedIds.has(c._id.toString())) continue;
        processedIds.add(c._id.toString());

        contactUpdates.push({
          updateOne: { filter: { _id: c._id }, update: { $set: { isDuplicate: true } } }
        });
        duplicateRecords.push({
          prospectId1: existing._id,
          entityType: "Contact",
          newData: { primaryPhone: c.primaryPhone, firstName: c.firstName, lastName: c.lastName, accountName: c.accountName },
          matchFields: ["primaryPhone"],
          source: "import",
          importLogId: c.importLogId || importLogId || null,
          status: "pending",
          companyId: cid,
        });
      }
    }

    // Write in batches so no single operation is huge
    let processedCount = 0;
    for (let i = 0; i < contactUpdates.length; i += BATCH_SIZE) {
      const batchUpdates = contactUpdates.slice(i, i + BATCH_SIZE);
      const batchRecords = duplicateRecords.slice(i, i + BATCH_SIZE);

      if (batchUpdates.length > 0) {
        await Contact.bulkWrite(batchUpdates, { ordered: false });
      }
      if (batchRecords.length > 0) {
        await Duplicate.insertMany(batchRecords, { ordered: false });
      }
      processedCount += batchUpdates.length;
      console.log(`[ContactDuplicateCheck] Processed ${processedCount}/${contactUpdates.length} duplicates`);
    }

    // Delete all duplicate contacts from collection after processing
    if (processedIds.size > 0) {
      const duplicateContactIds = Array.from(processedIds).map(
        id => new mongoose.Types.ObjectId(id)
      );

      const deleteResult = await Contact.deleteMany({
        _id: { $in: duplicateContactIds }
      });

      console.log(`[ContactDuplicateCheck] Deleted ${deleteResult.deletedCount} duplicate contacts from collection`);
    }

    console.log(`[ContactDuplicateCheck] Completed. Total duplicates: ${duplicateRecords.length}`);
  } catch (err) {
    console.error("[ContactDuplicateCheck] Error:", err.message);
    throw err;
  }
};

/**
 * Process duplicates synchronously for small datasets (≤5000 records)
 * Uses MongoDB aggregation pipeline for O(n) performance
 */
const processDuplicatesSync = async (cid, filter, importLogId) => {
  // Step 1: Find duplicates using aggregation pipeline
  const duplicatesByName = await Prospect.aggregate([
    { $match: { ...filter, accountName: { $exists: true, $nin: [null, ""] } } },
    { $project: { _id: 1, accountName: 1, accountNameLower: 1, website: 1, importLogId: 1 } },
    { $group: {
        _id: { $toLower: "$accountName" },
        count: { $sum: 1 },
        prospects: { $push: "$$ROOT" }
    }},
    { $match: { count: { $gt: 1 } } }
  ]);

  const duplicatesByWebsite = await Prospect.aggregate([
    { $match: { ...filter, website: { $exists: true, $nin: [null, ""] } } },
    { $project: { _id: 1, accountName: 1, website: 1, importLogId: 1 } },
    { $group: {
        _id: { $toLower: "$website" },
        count: { $sum: 1 },
        prospects: { $push: "$$ROOT" }
    }},
    { $match: { count: { $gt: 1 } } }
  ]);

  // Step 2: Process duplicates with bulk operations
  const prospectUpdates = [];
  const duplicateRecords = [];
  const processedIds = new Set();

  // Process name duplicates
  for (const group of duplicatesByName) {
    const [existing, ...incoming] = group.prospects;
    for (const p of incoming) {
      if (processedIds.has(p._id.toString())) continue;
      processedIds.add(p._id.toString());

      prospectUpdates.push({
        updateOne: { filter: { _id: p._id }, update: { $set: { isDuplicate: true } } }
      });
      duplicateRecords.push({
        prospectId1: existing._id,
        entityType: "Prospect",
        newData: { accountName: p.accountName, website: p.website },
        matchFields: ["accountName"],
        source: "import",
        importLogId: p.importLogId || importLogId || null,
        status: "pending",
        companyId: cid,
      });
    }
  }

  // Process website duplicates
  for (const group of duplicatesByWebsite) {
    const [existing, ...incoming] = group.prospects;
    for (const p of incoming) {
      if (processedIds.has(p._id.toString())) continue;
      processedIds.add(p._id.toString());

      prospectUpdates.push({
        updateOne: { filter: { _id: p._id }, update: { $set: { isDuplicate: true } } }
      });
      duplicateRecords.push({
        prospectId1: existing._id,
        entityType: "Prospect",
        newData: { accountName: p.accountName, website: p.website },
        matchFields: ["website"],
        source: "import",
        importLogId: p.importLogId || importLogId || null,
        status: "pending",
        companyId: cid,
      });
    }
  }

  // Step 3: Execute bulk operations
  if (prospectUpdates.length > 0) {
    await Prospect.bulkWrite(prospectUpdates, { ordered: false });
  }
  if (duplicateRecords.length > 0) {
    await Duplicate.insertMany(duplicateRecords, { ordered: false });

    // Step 4: Delete duplicate prospects from collection (move to duplicates page)
    const duplicateProspectIds = Array.from(processedIds).map(
      id => new mongoose.Types.ObjectId(id)
    );

    const deleteResult = await Prospect.deleteMany({
      _id: { $in: duplicateProspectIds }
    });

    console.log(`[DuplicateCheck] Deleted ${deleteResult.deletedCount} duplicate prospects from collection`);
  }

  return {
    checked: await Prospect.countDocuments(filter),
    duplicateCount: duplicateRecords.length,
  };
};

/**
 * Process duplicates asynchronously for large datasets (5000+ records)
 * Uses cursor-based streaming and batch processing
 */
const processDuplicatesAsync = async (cid, filter, importLogId) => {
  console.log(`[DuplicateCheck] Starting async processing for company ${cid}`);

  try {
    // Reset isDuplicate flag first
    await Prospect.updateMany(
      { ...filter, isDuplicate: true },
      { $set: { isDuplicate: false } }
    );

    // Process in batches using aggregation
    const BATCH_SIZE = 2000;
    let processedCount = 0;

    // Find all duplicates using aggregation
    const duplicatesByName = await Prospect.aggregate([
      { $match: { ...filter, accountName: { $exists: true, $nin: [null, ""] } } },
      { $project: { _id: 1, accountName: 1, accountNameLower: 1, website: 1, importLogId: 1 } },
      { $group: {
          _id: { $toLower: "$accountName" },
          count: { $sum: 1 },
          prospects: { $push: "$$ROOT" }
      }},
      { $match: { count: { $gt: 1 } } }
    ]);

    const duplicatesByWebsite = await Prospect.aggregate([
      { $match: { ...filter, website: { $exists: true, $nin: [null, ""] } } },
      { $project: { _id: 1, accountName: 1, website: 1, importLogId: 1 } },
      { $group: {
          _id: { $toLower: "$website" },
          count: { $sum: 1 },
          prospects: { $push: "$$ROOT" }
      }},
      { $match: { count: { $gt: 1 } } }
    ]);

    const prospectUpdates = [];
    const duplicateRecords = [];
    const processedIds = new Set();

    // Process name duplicates
    for (const group of duplicatesByName) {
      const [existing, ...incoming] = group.prospects;
      for (const p of incoming) {
        if (processedIds.has(p._id.toString())) continue;
        processedIds.add(p._id.toString());

        prospectUpdates.push({
          updateOne: { filter: { _id: p._id }, update: { $set: { isDuplicate: true } } }
        });
        duplicateRecords.push({
          prospectId1: existing._id,
          entityType: "Prospect",
          newData: { accountName: p.accountName, website: p.website },
          matchFields: ["accountName"],
          source: "import",
          importLogId: p.importLogId || importLogId || null,
          status: "pending",
          companyId: cid,
        });
      }
    }

    // Process website duplicates
    for (const group of duplicatesByWebsite) {
      const [existing, ...incoming] = group.prospects;
      for (const p of incoming) {
        if (processedIds.has(p._id.toString())) continue;
        processedIds.add(p._id.toString());

        prospectUpdates.push({
          updateOne: { filter: { _id: p._id }, update: { $set: { isDuplicate: true } } }
        });
        duplicateRecords.push({
          prospectId1: existing._id,
          entityType: "Prospect",
          newData: { accountName: p.accountName, website: p.website },
          matchFields: ["website"],
          source: "import",
          importLogId: p.importLogId || importLogId || null,
          status: "pending",
          companyId: cid,
        });
      }
    }

    // Write in batches
    for (let i = 0; i < prospectUpdates.length; i += BATCH_SIZE) {
      const batchUpdates = prospectUpdates.slice(i, i + BATCH_SIZE);
      const batchRecords = duplicateRecords.slice(i, i + BATCH_SIZE);

      if (batchUpdates.length > 0) {
        await Prospect.bulkWrite(batchUpdates, { ordered: false });
      }
      if (batchRecords.length > 0) {
        await Duplicate.insertMany(batchRecords, { ordered: false });
      }
      processedCount += batchUpdates.length;
      console.log(`[DuplicateCheck] Processed ${processedCount}/${prospectUpdates.length} duplicates`);
    }

    // Delete all duplicate prospects from collection after processing
    if (processedIds.size > 0) {
      const duplicateProspectIds = Array.from(processedIds).map(
        id => new mongoose.Types.ObjectId(id)
      );

      const deleteResult = await Prospect.deleteMany({
        _id: { $in: duplicateProspectIds }
      });

      console.log(`[DuplicateCheck] Deleted ${deleteResult.deletedCount} duplicate prospects from collection`);
    }

    console.log(`[DuplicateCheck] Completed. Total duplicates: ${duplicateRecords.length}`);
  } catch (err) {
    console.error("[DuplicateCheck] Error:", err.message);
    throw err;
  }
};

const repairOrphanedDuplicates = async (companyId) => {
  const cid = companyObjectId(companyId);

  const prospectOrphans = await Duplicate.find({
    entityType: "Prospect",
    status: "pending",
    $or: [{ companyId: null }, { companyId: { $exists: false } }],
  }).lean();

  for (const dup of prospectOrphans) {
    const linked = await Prospect.findById(dup.prospectId1).select("_id companyId").lean();
    if (linked?.companyId?.toString() === cid.toString()) {
      await Duplicate.updateOne({ _id: dup._id }, { $set: { companyId: cid } });
      continue;
    }

    const accountName = dup.newData?.accountName;
    if (!accountName) continue;

    const resolved = await Prospect.findOne({
      companyId: cid,
      accountNameLower: String(accountName).toLowerCase().trim(),
    }).select("_id").lean();

    if (resolved) {
      await Duplicate.updateOne(
        { _id: dup._id },
        { $set: { prospectId1: resolved._id, companyId: cid } }
      );
    }
  }

  const contactOrphans = await Duplicate.find({
    entityType: "Contact",
    status: "pending",
    $or: [{ companyId: null }, { companyId: { $exists: false } }],
  }).lean();

  for (const dup of contactOrphans) {
    const linked = await Contact.findById(dup.prospectId1).select("_id companyId").lean();
    if (linked?.companyId?.toString() !== cid.toString()) continue;
    await Duplicate.updateOne({ _id: dup._id }, { $set: { companyId: cid } });
  }
};

const duplicateService = {

  getAll: async (query, companyId) => {
    await repairOrphanedDuplicates(companyId);

    const { page = 1, limit = 10, status, type, entityType } = query;
    const filter = {};
    if (status) filter.status = status;
    if (type === "import") filter.newData = { $ne: null };
    if (type === "manual") filter.prospectId2 = { $ne: null };

    const cid = companyObjectId(companyId);
    const baseFilter = { ...filter, companyId: cid };

    const { duplicates, total } = await duplicateRepository.findAllForCompany({
      companyId,
      filter,
      page: Number(page),
      limit: Number(limit),
      entityType: entityType === "Contact" || entityType === "Prospect" ? entityType : undefined,
    });

    const [accountTotal, contactTotal] = await Promise.all([
      Duplicate.countDocuments({ ...baseFilter, entityType: "Prospect" }),
      Duplicate.countDocuments({ ...baseFilter, entityType: "Contact" }),
    ]);

    return {
      duplicates,
      counts: { accounts: accountTotal, contacts: contactTotal },
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  },

  getById: async (id) => {
    const duplicate = await duplicateRepository.findById(id);
    if (!duplicate) {
      const error = new Error("Duplicate record not found");
      error.statusCode = 404;
      throw error;
    }
    return duplicate;
  },

  // ── Skip — keep existing, discard new ────────────────────────────────────
  skip: async (id, userId) => {
    const duplicate = await duplicateRepository.findById(id);
    if (!duplicate) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    if (duplicate.status !== "pending") throw Object.assign(new Error(`Already ${duplicate.status}`), { statusCode: 400 });

    const updated = await duplicateRepository.update(id, {
      status:     "skipped",
      reviewedBy: userId,
      reviewedAt: new Date(),
    });

    await auditLogService.log({
      userId,
      action:      "UPDATE",
      entity:      "Duplicate",
      entityId:    id,
      description: `Duplicate skipped — incoming record discarded`,
    });

    return updated;
  },

  // ── Keep Both — save new record as separate prospect OR contact ───────────
  keepBoth: async (id, userId) => {
    const duplicate = await duplicateRepository.findById(id);
    if (!duplicate) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    if (duplicate.status !== "pending") throw Object.assign(new Error(`Already ${duplicate.status}`), { statusCode: 400 });

    if (!duplicate.newData) throw Object.assign(new Error("No newData to save"), { statusCode: 400 });

    const isContactDup = duplicate.entityType === "Contact";

    if (isContactDup) {
      // Save as new contact
      const { _id, ...contactData } = duplicate.newData;
      await Contact.create({
        ...contactData,
        companyId: contactData.companyId ?? null,
        importLogId: duplicate.importLogId,
        source: contactData.source || "excel",
      });
    } else {
      // Save as new prospect (account)
      const { contacts, ...prospectData } = duplicate.newData;
      const created = await prospectRepository.create({
        ...prospectData,
        isDuplicate: true,
        source:      "excel",
        importLogId: duplicate.importLogId,
      });

      if (contacts?.length) {
        await saveContactsForProspect(
          Contact,
          { contacts, accountName: created.accountName },
          created,
          duplicate.importLogId,
          created.companyId
        );
      }
    }

    const updated = await duplicateRepository.update(id, {
      status:     "kept_both",
      reviewedBy: userId,
      reviewedAt: new Date(),
    });

    await auditLogService.log({
      userId,
      action:      "CREATE",
      entity:      "Duplicate",
      entityId:    id,
      description: `Duplicate kept both — new ${isContactDup ? "contact" : "record"} saved separately`,
    });

    return updated;
  },

  // ── Dismiss — old behaviour: mark dismissed, keep both existing records ──
  dismiss: async (id, userId) => {
    const duplicate = await duplicateRepository.findById(id);
    if (!duplicate) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    if (duplicate.status !== "pending") throw Object.assign(new Error(`Already ${duplicate.status}`), { statusCode: 400 });

    const updated = await duplicateRepository.update(id, {
      status:     "dismissed",
      reviewedBy: userId,
      reviewedAt: new Date(),
    });

    // Only update isDuplicate if both are DB records (manual duplicate)
    if (duplicate.prospectId1) await prospectRepository.update(duplicate.prospectId1._id || duplicate.prospectId1, { isDuplicate: false });
    if (duplicate.prospectId2) await prospectRepository.update(duplicate.prospectId2._id || duplicate.prospectId2, { isDuplicate: false });

    await auditLogService.log({
      userId,
      action:      "UPDATE",
      entity:      "Duplicate",
      entityId:    id,
      description: `Duplicate dismissed — kept both records`,
    });

    return updated;
  },

  // ── Merge ─────────────────────────────────────────────────────────────────
  merge: async (id, userId) => {
    const duplicate = await duplicateRepository.findById(id);
    if (!duplicate) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    if (duplicate.status !== "pending") throw Object.assign(new Error(`Already ${duplicate.status}`), { statusCode: 400 });

    const isContactDup = duplicate.entityType === "Contact";

    if (isContactDup) {
      const contactId = duplicate.prospectId1._id || duplicate.prospectId1;
      const contactScope = duplicate.companyId
        ? { _id: contactId, companyId: duplicate.companyId }
        : { _id: contactId };
      const existingContact = await Contact.findOne(contactScope);
      if (!existingContact) throw Object.assign(new Error("Existing contact not found"), { statusCode: 404 });

      if (duplicate.newData) {
        const contactMergeFields = [
          "standardizedRoles", "functionalDomain", "keyFocusAreas", "seniority",
          "primaryPhone", "secondaryPhone", "primaryMobNo",
          "linkedIn", "twitterUrl", "country", "state", "city", "timeZone",
          "accountId", "accountName", "accountIndustry", "accountCountry",
          "accountSalesPriority", "accountClvRanking", "isLinked",
        ];
        const updateData = {};
        for (const field of contactMergeFields) {
          if (duplicate.newData[field] && !existingContact[field]) {
            updateData[field] = duplicate.newData[field];
          }
        }
        if (Object.keys(updateData).length > 0) {
          await Contact.findOneAndUpdate(contactScope, { $set: updateData });
        }
      }

      const updated = await duplicateRepository.update(id, {
        status:     "merged",
        reviewedBy: userId,
        reviewedAt: new Date(),
      });

      await auditLogService.log({
        userId,
        action:      "UPDATE",
        entity:      "Duplicate",
        entityId:    id,
        description: `Contact duplicate merged into existing record`,
      });

      return updated;
    }

    // Account duplicate merge
    const winner = await prospectRepository.findById(duplicate.prospectId1._id || duplicate.prospectId1);
    if (!winner) throw Object.assign(new Error("Existing prospect not found"), { statusCode: 404 });

    // Import duplicate — merge newData fields into existing prospect
    if (duplicate.newData) {
      const mergeFields = [
        "primaryIndustry", "businessModel", "country", "hqLocationCity",
        "annualRevenue", "noOfEmployees", "primaryTechStack", "secondaryTechStack",
        "techAdoptionProfile", "infrastructureRisk", "techFitScore",
        "intentSignal", "salesPriority", "clvRanking", "financialCapacity",
        "marginPotential", "strategicValue", "historyTrigger", "servicePitch",
        "commercialCategory", "accountSource", "campaignName", "comments",
        "website",
      ];
      const updateData = {};
      for (const field of mergeFields) {
        if (duplicate.newData[field] && !winner[field]) updateData[field] = duplicate.newData[field];
      }
      if (Object.keys(updateData).length > 0) {
        await prospectRepository.update(winner._id, updateData);
      }

      if (duplicate.newData.contacts?.length) {
        await saveContactsForProspect(
          Contact,
          duplicate.newData,
          winner,
          duplicate.importLogId,
          winner.companyId
        );
      }
    }

    // Manual duplicate — merge loser into winner
    if (duplicate.prospectId2) {
      const loser = await prospectRepository.findById(duplicate.prospectId2._id || duplicate.prospectId2);
      if (loser) {
        const winnerEmails = new Set(
          (await Contact.find({ accountId: winner._id, companyId: winner.companyId }).select("email").lean())
            .map((c) => normEmail(c.email))
            .filter(Boolean)
        );

        const loserContacts = await Contact.find({
          accountId: loser._id,
          companyId: loser.companyId ?? winner.companyId,
        }).lean();
        for (const contact of loserContacts) {
          const email = normEmail(contact.email);
          if (email && winnerEmails.has(email)) continue;

          await Contact.findByIdAndUpdate(contact._id, {
            $set: {
              accountId:   winner._id,
              accountName: winner.accountName,
              accountIndustry:      winner.primaryIndustry  || null,
              accountCountry:       winner.country          || null,
              accountCity:          winner.hqLocationCity   || null,
              accountEmployees:     winner.noOfEmployees    || null,
              accountRevenue:       winner.annualRevenue    || null,
              accountSalesPriority: winner.salesPriority    || null,
              accountClvRanking:    winner.clvRanking       || null,
            },
          });
        }
        if (loser.campaignIds?.length > 0) {
          await prospectRepository.update(winner._id, {
            $addToSet: { campaignIds: { $each: loser.campaignIds } },
          });
        }
        await prospectRepository.delete(loser._id);
      }
    }

    const updated = await duplicateRepository.update(id, {
      status:     "merged",
      reviewedBy: userId,
      reviewedAt: new Date(),
    });

    await auditLogService.log({
      userId,
      action:      "UPDATE",
      entity:      "Duplicate",
      entityId:    id,
      description: `Duplicate merged into "${winner.accountName}"`,
      metadata: { winner: winner._id },
    });

    return updated;
  },

  // ── Delete — hard delete the duplicate record itself (not the prospects) ──
  deleteDuplicate: async (id, userId) => {
    const duplicate = await duplicateRepository.findById(id);
    if (!duplicate) throw Object.assign(new Error("Duplicate record not found"), { statusCode: 404 });

    await duplicateRepository.delete(id);

    await auditLogService.log({
      userId,
      action:      "DELETE",
      entity:      "Duplicate",
      entityId:    id,
      description: `Duplicate record hard deleted`,
    });

    return { deleted: true, id };
  },

  // ── Bulk action — apply same action to multiple IDs ───────────────────────
  bulkAction: async (ids, action, userId) => {
    const results = { success: 0, failed: 0, errors: [] };

    for (const id of ids) {
      try {
        if (action === "merge")           await duplicateService.merge(id, userId);
        else if (action === "skip")       await duplicateService.skip(id, userId);
        else if (action === "keep-both")  await duplicateService.keepBoth(id, userId);
        else if (action === "delete")     await duplicateService.deleteDuplicate(id, userId);
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push({ id, error: err.message });
      }
    }

    return results;
  },

  /**
   * Check contact duplicates using MongoDB aggregation pipeline for O(n) performance.
   * Small datasets (≤5000) run synchronously and return the final result.
   * Large datasets run in the background and return a "processing" status
   * immediately, so the HTTP request never hits a timeout — mirrors the
   * account (Prospect) duplicate check behaviour.
   */
  checkContactDuplicates: async (companyId, importLogId = null) => {
    const cid = companyObjectId(companyId);
    const filter = { companyId: cid };
    if (importLogId) filter.importLogId = new mongoose.Types.ObjectId(importLogId);

    // Get total count first (fast)
    const totalCount = await Contact.countDocuments(filter);

    if (totalCount <= CONTACT_DUPLICATE_ASYNC_THRESHOLD) {
      return await processContactDuplicatesSync(cid, filter, importLogId);
    }

    // For large datasets: start background processing and return immediately
    processContactDuplicatesAsync(cid, filter, importLogId).catch((err) => {
      console.error("[ContactDuplicateCheck] Background processing failed:", err.message);
    });

    return {
      checked: totalCount,
      duplicateCount: 0,
      status: "processing",
      message: `Duplicate check started in background for ${totalCount} contacts. Check status shortly.`,
    };
  },

  /**
   * Check duplicates using MongoDB aggregation pipeline for O(n) performance.
   * Processes in background to avoid HTTP timeout on large datasets (100k+).
   */
  checkDuplicates: async (companyId, importLogId = null) => {
    const cid = companyObjectId(companyId);
    const filter = { companyId: cid };
    if (importLogId) filter.importLogId = new mongoose.Types.ObjectId(importLogId);

    // Get total count first (fast)
    const totalCount = await Prospect.countDocuments(filter);

    // If small dataset, process synchronously
    if (totalCount <= 5000) {
      return await processDuplicatesSync(cid, filter, importLogId);
    }

    // For large datasets: start background processing and return immediately
    processDuplicatesAsync(cid, filter, importLogId).catch((err) => {
      console.error("[DuplicateCheck] Background processing failed:", err.message);
    });

    return {
      checked: totalCount,
      duplicateCount: 0,
      status: "processing",
      message: `Duplicate check started in background for ${totalCount} prospects. Refresh page to see results.`,
    };
  },

  /**
   * Get duplicate check status (for polling) — accounts (Prospect)
   */
  getDuplicateCheckStatus: async (companyId, importLogId = null) => {
    const cid = companyObjectId(companyId);
    const filter = { companyId: cid, entityType: "Prospect", status: "pending" };
    if (importLogId) filter.importLogId = new mongoose.Types.ObjectId(importLogId);

    const pendingCount = await Duplicate.countDocuments(filter);
    const totalProspects = await Prospect.countDocuments({ companyId: cid });

    return {
      pendingDuplicates: pendingCount,
      totalProspects,
    };
  },

  /**
   * Get contact duplicate check status (for polling).
   * Since the async worker doesn't write a job/log record, "done" is
   * inferred once the Contact collection count has stopped shrinking, or
   * simply by pendingDuplicates existing. The frontend should poll a few
   * times and then just refresh the contacts list either way.
   */
  getContactDuplicateCheckStatus: async (companyId, importLogId = null) => {
    const cid = companyObjectId(companyId);
    const filter = { companyId: cid, entityType: "Contact", status: "pending" };
    if (importLogId) filter.importLogId = new mongoose.Types.ObjectId(importLogId);

    const pendingCount = await Duplicate.countDocuments(filter);
    const totalContacts = await Contact.countDocuments({ companyId: cid });

    return {
      pendingDuplicates: pendingCount,
      totalContacts,
    };
  },
};

export default duplicateService;