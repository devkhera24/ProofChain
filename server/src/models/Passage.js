import mongoose from "mongoose";
import { toJSONPlugin } from "./plugins.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const passageSchema = new Schema(
  {
    projectId: { type: ObjectId, required: true },
    sourceId: { type: ObjectId, ref: "Source", required: true, index: true },
    humanId: { type: String, required: true }, // "P-14"
    text: { type: String, required: true },
    page: Number,
    paragraph: Number,
    charStart: { type: Number, required: true },
    charEnd: { type: Number, required: true },
    embedding: { type: [Number], select: false },
  },
  { timestamps: true },
);
passageSchema.index({ projectId: 1, humanId: 1 }, { unique: true });
passageSchema.plugin(toJSONPlugin);

export const Passage = mongoose.model("Passage", passageSchema);
