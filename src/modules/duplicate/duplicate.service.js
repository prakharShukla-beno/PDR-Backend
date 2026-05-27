import duplicateRepository from "./duplicate.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";
import contactRepository from "../contacts/contact.repository.js";
import auditLogService from "../auditLog/auditLog.service.js"; // ← ADD

const duplicateService = {

  getAll: async (query) => {
    const { page = 1, limit = 10, status } = query;
    const filter = {};
    if (status) filter.status = status;

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

  // ── Dismiss ────────────────────────────────────────────────────────────────
  dismiss: async (id, userId) => {
    const duplicate = await duplicateRepository.findById(id);
    if (!duplicate) {
      const error = new Error("Duplicate record not found");
      error.statusCode = 404;
      throw error;
    }
    if (duplicate.status !== "pending") {
      const error = new Error(`Cannot dismiss — already ${duplicate.status}`);
      error.statusCode = 400;
      throw error;
    }

    const updated = await duplicateRepository.update(id, {
      status:     "dismissed",
      reviewedBy: userId,
      reviewedAt: new Date(),
    });

    await prospectRepository.update(duplicate.prospectId1._id, { isDuplicate: false });
    await prospectRepository.update(duplicate.prospectId2._id, { isDuplicate: false });

    // ── FR-4.3: Audit log ─────────────────────────────────────────────────
    await auditLogService.log({
      userId,
      action:      "UPDATE",
      entity:      "Duplicate",
      entityId:    id,
      description: `Duplicate dismissed — kept both records`,
      metadata: {
        prospectId1: duplicate.prospectId1._id,
        prospectId2: duplicate.prospectId2._id,
      },
    });

    return updated;
  },

  // ── Merge ──────────────────────────────────────────────────────────────────
  merge: async (id, userId) => {
    const duplicate = await duplicateRepository.findById(id);
    if (!duplicate) {
      const error = new Error("Duplicate record not found");
      error.statusCode = 404;
      throw error;
    }
    if (duplicate.status !== "pending") {
      const error = new Error(`Cannot merge — already ${duplicate.status}`);
      error.statusCode = 400;
      throw error;
    }

    const winner = await prospectRepository.findById(duplicate.prospectId1._id);
    const loser  = await prospectRepository.findById(duplicate.prospectId2._id);

    if (!winner || !loser) {
      const error = new Error("One or both prospects no longer exist");
      error.statusCode = 404;
      throw error;
    }

    // ── Migrate loser's contacts into the winner's account
    // Using the Contact collection (new architecture)
    await contactRepository.updateMany(
      { accountId: loser._id },
      {
        $set: {
          accountId:   winner._id,
          accountName: winner.accountName,
          // Also update denormalized account fields
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

    // ── Add loser's campaignIds to the winner
    if (loser.campaignIds && loser.campaignIds.length > 0) {
      await prospectRepository.update(winner._id, {
        $addToSet: { campaignIds: { $each: loser.campaignIds } },
      });
    }

    // ── Delete the loser prospect
    await prospectRepository.delete(loser._id);

    // ── Update the duplicate record
    const updated = await duplicateRepository.update(id, {
      status:     "merged",
      reviewedBy: userId,
      reviewedAt: new Date(),
    });

    // ── FR-4.3: Audit log ─────────────────────────────────────────────────
    await auditLogService.log({
      userId,
      action:      "DELETE",
      entity:      "Duplicate",
      entityId:    id,
      description: `Duplicate merged — "${loser.accountName}" merged into "${winner.accountName}"`,
      metadata: {
        winner:  winner._id,
        deleted: loser._id,
      },
    });

    return {
      duplicate:       updated,
      mergedInto:      winner._id,
      deletedProspect: loser._id,
    };
  },
};

export default duplicateService;