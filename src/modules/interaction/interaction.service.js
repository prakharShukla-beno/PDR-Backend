import interactionRepository from "./interaction.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";

const interactionService = {

  // Naya interaction log karo
  create: async ({ prospectId, type, notes, outcome, conductedBy, interactedAt }) => {

    // Prospect exist karta hai ya nahi check karo
    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }

    const interaction = await interactionRepository.create({
      prospectId,
      type,
      notes:        notes || null,
      outcome:      outcome || null,
      conductedBy:  conductedBy || null,
      interactedAt: new Date(interactedAt),
    });

    // Prospect ke interactionIds mein add karo
    await prospectRepository.update(prospectId, {
      $push: { interactionIds: interaction._id },
    });

    return interaction;
  },

  // Ek prospect ki saari interactions fetch karo
  getByProspectId: async ({ prospectId, page, limit }) => {

    // Prospect exist karta hai ya nahi
    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      const error = new Error("Prospect not found");
      error.statusCode = 404;
      throw error;
    }

    const { interactions, total } = await interactionRepository.findByProspectId({
      prospectId,
      page:  Number(page) || 1,
      limit: Number(limit) || 10,
    });

    return {
      interactions,
      pagination: {
        total,
        page:       Number(page) || 1,
        limit:      Number(limit) || 10,
        totalPages: Math.ceil(total / (Number(limit) || 10)),
      },
    };
  },

  // Single interaction detail
  getById: async (id) => {
    const interaction = await interactionRepository.findById(id);

    if (!interaction) {
      const error = new Error("Interaction not found");
      error.statusCode = 404;
      throw error;
    }

    return interaction;
  },

  // Interaction update karo
  update: async (id, data) => {
    const interaction = await interactionRepository.findById(id);

    if (!interaction) {
      const error = new Error("Interaction not found");
      error.statusCode = 404;
      throw error;
    }

    // interactedAt update ho raha hai toh Date object banao
    if (data.interactedAt) data.interactedAt = new Date(data.interactedAt);

    return await interactionRepository.update(id, data);
  },

  // Interaction delete karo
  delete: async (id, prospectId) => {
    const interaction = await interactionRepository.findById(id);

    if (!interaction) {
      const error = new Error("Interaction not found");
      error.statusCode = 404;
      throw error;
    }

    await interactionRepository.delete(id);

    // Prospect ke interactionIds se bhi remove karo
    await prospectRepository.update(interaction.prospectId, {
      $pull: { interactionIds: interaction._id },
    });

    return { message: "Interaction deleted successfully" };
  },
};

export default interactionService;