import mongoose from "mongoose";
import { toJSONPlugin } from "./plugins.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const sourceSchema = new Schema(
  {
    projectId: { type: ObjectId, ref: "Project", required: true, index: true },
    addedBy: { type: ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["url", "pdf", "paper"], required: true },
    url: String,
    fileName: String,
    ids: { doi: String, s2Id: String, openAlexId: String, arxivId: String },
    title: { type: String, default: "Untitled source" },
    authors: [String],
    venue: String,
    year: Number,
    sourceType: {
      type: String,
      enum: ["peer_reviewed", "preprint", "vendor", "news", "blog", "unknown"],
      default: "unknown",
    },
    depth: { type: String, enum: ["full_text", "abstract_only"], default: "full_text" },
    status: { type: String, enum: ["queued", "processing", "ready", "failed"], default: "queued", index: true },
    error: String,
    rawPages: { type: [String], select: false }, // extracted text before chunking (lets jobs resume)
    text: { type: String, select: false }, // canonical normalised text (offsets refer to this)
    pageStarts: { type: [Number], select: false }, // char offset where each page starts in `text`
    textHash: String,
    retrievedAt: Date,
    passageCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
sourceSchema.index(
  { projectId: 1, textHash: 1 },
  { unique: true, partialFilterExpression: { textHash: { $type: "string" } } },
);
sourceSchema.plugin(toJSONPlugin);

export const Source = mongoose.model("Source", sourceSchema);
