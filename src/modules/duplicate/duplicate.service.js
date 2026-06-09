import duplicateRepository from "./duplicate.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";
import contactRepository from "../contacts/contact.repository.js";
import Contact from "../contacts/contact.model.js";
import auditLogService from "../auditLog/auditLog.service.js";

const duplicateService = {

  getAll: async (query) => {
    const { page = 1, limit = 10, status, type } = query;
    const filter = {};
    if (status) filter.status = status;
    // type=import → newData wale | type=manual → prospectId2 wale
    if (type === "import") filter.newData = { $ne: null };
    if (type === "manual") filter.prospectId2 = { $ne: null };

    const { duplicates, total } = await duplicateRepository.findAll({
      filter,
      page:  Number(page),
      limit: Number(limit),
    });

    return {
      duplicates,
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
        importLogId: duplicate.importLogId,
        source: contactData.source || "excel",
      });
    } else {
      // Save as new prospect (account)
      const { contacts, ...prospectData } = duplicate.newData;
      await prospectRepository.create({
        ...prospectData,
        isDuplicate: true,
        source:      "excel",
        importLogId: duplicate.importLogId,
      });
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
      // Merge contact: update existing contact with new data (only fill empty fields)
      const existingContact = await Contact.findById(duplicate.prospectId1._id || duplicate.prospectId1);
      if (!existingContact) throw Object.assign(new Error("Existing contact not found"), { statusCode: 404 });

      if (duplicate.newData) {
        const contactMergeFields = [
          "standardizedRoles", "functionalDomain", "keyFocusAreas",
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
          await Contact.findByIdAndUpdate(existingContact._id, { $set: updateData });
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
    }

    // Manual duplicate — merge loser into winner
    if (duplicate.prospectId2) {
      const loser = await prospectRepository.findById(duplicate.prospectId2._id || duplicate.prospectId2);
      if (loser) {
        await contactRepository.updateMany(
          { accountId: loser._id },
          {
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
          }
        );
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
};

export default duplicateService;