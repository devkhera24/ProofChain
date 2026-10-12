import mongoose from "mongoose";
import { toJSONPlugin } from "./plugins.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// Threads on links or claims
const commentSchema = new Schema(
  {
    projectId: { type: ObjectId, required: true },
    target: { kind: { type: String, enum: ["link", "claim"] }, id: ObjectId },
    authorId: { type: ObjectId, ref: "User", required: true },
    text: { type: String, required: true, maxlength: 2000 },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true },
);
commentSchema.index({ "target.id": 1, createdAt: 1 });
commentSchema.plugin(toJSONPlugin);

export const Comment = mongoose.model("Comment", commentSchema);
