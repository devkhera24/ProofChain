import mongoose from "mongoose";
import { toJSONPlugin } from "./plugins.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// One row per paper decision, so rejected papers never resurface
const feedbackSchema = new Schema(
  {
    projectId: { type: ObjectId, required: true },
    userId: { type: ObjectId, required: true },
    paperKey: { type: String, required: true }, // doi:… | s2:… | oa:… (see Step 22)
    action: { type: String, enum: ["added", "not_relevant", "read", "later"], required: true },
    reason: String,
  },
  { timestamps: true },
);
feedbackSchema.index({ projectId: 1, paperKey: 1 });
feedbackSchema.plugin(toJSONPlugin);

export const Feedback = mongoose.model("Feedback", feedbackSchema);
