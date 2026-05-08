import duplicateRepository from "./duplicate.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";

const duplicateService = {

  // Saare duplicates fetch karo with optional status filter
  getAll: async ({ page = 1, limit = 10, status }) => {
    const filter = {};

    // Status filter — pending / merged / dismissed
    if (status) filter.status = status;

    const { duplicates, total } = await duplicateRepository.findAll({
      filter,
      page: Number(page),
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

  // Single duplicate pair fetch karo
  getById: async (id) => {
    const duplicate = await duplicateRepository.findById(id);

    if (!duplicate) {
      const error = new Error("Duplicate record not found");
      error.statusCode = 404;
      throw error;
    }

    return duplicate;
  },

  // Dismiss — duplicate nahi hai, dono alag prospects hain
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

    // Status update karo
    const updated = await duplicateRepository.update(id, {
      status:     "dismissed",
      reviewedBy: userId,
      reviewedAt: new Date(),
    });

    // Dono prospects ka isDuplicate flag false karo
    await prospectRepository.update(duplicate.prospectId1._id, { isDuplicate: false });
    await prospectRepository.update(duplicate.prospectId2._id, { isDuplicate: false });

    return updated;
  },

  // Merge — prospectId2 ko prospectId1 mein merge karo, phir delete karo
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

    // prospectId1 = winner (keep), prospectId2 = loser (delete)
    const winner = await prospectRepository.findById(duplicate.prospectId1._id);
    const loser  = await prospectRepository.findById(duplicate.prospectId2._id);

    if (!winner || !loser) {
      const error = new Error("One or both prospects no longer exist");
      error.statusCode = 404;
      throw error;
    }

    // Loser ke contacts winner mein merge karo — duplicates skip karo
    const existingEmails = winner.contacts.map((c) => c.email).filter(Boolean);
    const newContacts = loser.contacts.filter(
      (c) => !c.email || !existingEmails.includes(c.email)
    );

    if (newContacts.length > 0) {
      await prospectRepository.update(winner._id, {
        $push: { contacts: { $each: newContacts } },
      });
    }

    // Loser ke campaignIds winner mein add karo
    if (loser.campaignIds && loser.campaignIds.length > 0) {
      await prospectRepository.update(winner._id, {
        $addToSet: { campaignIds: { $each: loser.campaignIds } },
      });
    }

    // Loser prospect delete karo
    await prospectRepository.delete(loser._id);

    // Winner ka isDuplicate false karo
    await prospectRepository.update(winner._id, { isDuplicate: false });

    // Duplicate record update karo
    const updated = await duplicateRepository.update(id, {
      status:     "merged",
      reviewedBy: userId,
      reviewedAt: new Date(),
    });

    return {
      duplicate: updated,
      mergedInto: winner._id,
      deletedProspect: loser._id,
    };
  },
};

export default duplicateService;