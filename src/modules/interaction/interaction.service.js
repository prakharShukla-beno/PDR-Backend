import interactionRepository from "./interaction.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";

const interactionService = {

  // Log a new interaction
  create: async ({ prospectId, type, notes, outcome, conductedBy, interactedAt }) => {

    // Check if the prospect exists
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

    // Add the interaction ID to the prospect's interactionIds
    await prospectRepository.update(prospectId, {
      $push: { interactionIds: interaction._id },
    });

    return interaction;
  },

  // Fetch all interactions for a prospect
  getByProspectId: async ({ prospectId, page, limit }) => {

    // Verify the prospect exists
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

  // Update an interaction
  update: async (id, data) => {
    const interaction = await interactionRepository.findById(id);

    if (!interaction) {
      const error = new Error("Interaction not found");
      error.statusCode = 404;
      throw error;
    }

    // If `interactedAt` is provided, convert it to a Date object
    if (data.interactedAt) data.interactedAt = new Date(data.interactedAt);

    return await interactionRepository.update(id, data);
  },

  // Delete an interaction
  delete: async (id, prospectId) => {
    const interaction = await interactionRepository.findById(id);

    if (!interaction) {
      const error = new Error("Interaction not found");
      error.statusCode = 404;
      throw error;
    }

    await interactionRepository.delete(id);

    // Also remove the interaction ID from the prospect's interactionIds
    await prospectRepository.update(interaction.prospectId, {
      $pull: { interactionIds: interaction._id },
    });

    return { message: "Interaction deleted successfully" };
  },
};

export default interactionService;