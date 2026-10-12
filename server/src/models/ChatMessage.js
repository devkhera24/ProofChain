import mongoose from "mongoose";
import { toJSONPlugin } from "./plugins.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const chatSchema = new Schema(
  {
    projectId: { type: ObjectId, required: true, index: true },
    userId: { type: ObjectId, ref: "User" },
    role: { type: String, enum: ["user", "agent", "system"], required: true },
    content: { type: String, required: true },
    citations: [{ passageId: ObjectId, humanId: String, sourceId: ObjectId, quote: String, matchType: String }],
    meta: Schema.Types.Mixed, // { intent, claimId, batchId, validation: {...} }
  },
  { timestamps: true },
);
chatSchema.plugin(toJSONPlugin);

export const ChatMessage = mongoose.model("ChatMessage", chatSchema);
