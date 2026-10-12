import mongoose from "mongoose";
import { toJSONPlugin } from "./plugins.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

export const SLOTS = ["CORE", "CORE_2", "FOUNDATION", "FRONTIER", "CHALLENGER"];

const itemSchema = new Schema(
  {
    slot: { type: String, enum: SLOTS },
    slotNote: String, // e.g. "No strong recent work found; showing another core paper"
    paper: {
      ids: { doi: String, s2Id: String, openAlexId: String, arxivId: String },
      title: String,
      authors: [String],
      venue: String,
      year: Number,
      abstract: String,
      citationCount: Number,
      oaPdfUrl: String,
      url: String,
    },
    score: Number,
    scoreBreakdown: Schema.Types.Mixed,
    gapTargets: [{ claimId: ObjectId, humanId: String, gapType: String }],
    rationale: String,
    rationaleQuote: String,
    groundingPassed: Boolean,
    verifiedIds: [String], // e.g. ["doi","s2","openalex"]
    feedback: { action: String, reason: String, at: Date, by: ObjectId },
  },
  { _id: false },
);

const batchSchema = new Schema(
  {
    projectId: { type: ObjectId, required: true, index: true },
    userId: { type: ObjectId, required: true },
    humanId: String, // "B2"
    trigger: { type: String, enum: ["onboarding", "question", "gap", "manual"], required: true },
    triggerText: String,
    status: { type: String, enum: ["running", "ready", "failed"], default: "running" },
    error: String,
    items: [itemSchema],
    pipelineLog: [String],
  },
  { timestamps: true },
);
batchSchema.plugin(toJSONPlugin);

export const RecommendationBatch = mongoose.model("RecommendationBatch", batchSchema);
