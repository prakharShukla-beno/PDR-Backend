import mongoose from "mongoose";

const interactionSchema = new mongoose.Schema(
  {
    prospectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prospect",
      required: [true, "Prospect reference is required"],
    },
    type: {
      type: String,
      required: [true, "Interaction type is required"],
      enum: ["Email", "Call", "Meeting", "LinkedIn DM", "Demo", "Follow-Up", "Event"],
    },
    notes:   { type: String, default: null },
    outcome: {
      type: String,
      enum: ["Positive", "Neutral", "Negative", "No Response", null],
      default: null,
    },
    conductedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    interactedAt: {
      type: Date,
      required: [true, "Interaction date is required"],
    },
  },
  {
    timestamps: true,
  }
);

interactionSchema.index({ prospectId: 1 });

const Interaction = mongoose.model("Interaction", interactionSchema);
export default Interaction;