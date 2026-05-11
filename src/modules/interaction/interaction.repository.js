import Interaction from "./interaction.model.js";

const interactionRepository = {

  // Naya interaction record save karo
  create: async (data) => {
    return await Interaction.create(data);
  },

  // Ek prospect ki saari interactions fetch karo
  findByProspectId: async ({ prospectId, page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;

    const [interactions, total] = await Promise.all([
      Interaction.find({ prospectId })
        .populate("conductedBy", "name email")
        .sort({ interactedAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Interaction.countDocuments({ prospectId }),
    ]);

    return { interactions, total };
  },

  // Single interaction by ID
  findById: async (id) => {
    return await Interaction.findById(id)
      .populate("conductedBy", "name email")
      .populate("prospectId", "accountName website");
  },

  // Interaction update karo
  update: async (id, data) => {
    return await Interaction.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
  },

  // Interaction delete karo
  delete: async (id) => {
    return await Interaction.findByIdAndDelete(id);
  },
};

export default interactionRepository;