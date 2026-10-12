import mongoose from "mongoose";
import { toJSONPlugin } from "./plugins.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

export const STANCES = ["supports", "contradicts", "inconclusive"];
export const LINK_STATUSES = ["ai_suggested", "under_review", "confirmed", "rejected", "disputed"];

const linkSchema = new Schema(
  {
    projectId: { type: ObjectId, required: true, index: true },
    humanId: String, // "L-88"
    claimId: { type: ObjectId, ref: "Claim", required: true, index: true },
    passageId: { type: ObjectId, ref: "Passage", required: true },
    sourceId: { type: ObjectId, ref: "Source", required: true },
    stance: { type: String, enum: STANCES, required: true },
    scope: String,
    status: { type: String, enum: LINK_STATUSES, default: "ai_suggested" },
    origin: { type: String, enum: ["ai", "user"], default: "ai" },
    quote: String,
    matchType: { type: String, enum: ["exact", "near_match"] },
    matchScore: Number,
    aiRationale: String,
    reviewedBy: { type: ObjectId, ref: "User" },
    reviewedAt: Date,
  },
  { timestamps: true },
);
linkSchema.index({ claimId: 1, passageId: 1 }, { unique: true });
linkSchema.plugin(toJSONPlugin);

export const EvidenceLink = mongoose.model("EvidenceLink", linkSchema);
