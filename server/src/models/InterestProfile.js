import mongoose from "mongoose";
import { toJSONPlugin } from "./plugins.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const profileSchema = new Schema(
  {
    projectId: { type: ObjectId, required: true },
    userId: { type: ObjectId, required: true },
    topics: [String],
    level: String,
    vector: { type: [Number], select: false },
    questionHistory: [{ text: String, embedding: { type: [Number], select: false }, at: Date }],
    exclusions: [
      {
        concept: String,
        strength: { type: String, enum: ["soft", "hard"] },
        reason: String,
        embedding: { type: [Number], select: false },
        createdAt: Date,
      },
    ],
  },
  { timestamps: true },
);
profileSchema.index({ projectId: 1, userId: 1 }, { unique: true });
profileSchema.plugin(toJSONPlugin);

export const InterestProfile = mongoose.model("InterestProfile", profileSchema);
