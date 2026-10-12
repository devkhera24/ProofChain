import mongoose from "mongoose";
import { toJSONPlugin } from "./plugins.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

export const CLAIM_STATUSES = ["open", "supported", "contested", "unsupported"];
export const GAP_TYPES = ["single_source", "interested_party_only", "unchallenged", "stale", "abstract_only", "contested"];

const gapSchema = new Schema(
  {
    type: { type: String, enum: GAP_TYPES },
    weight: Number,
    queryHint: String,
    detectedAt: Date,
  },
  { _id: false },
);

const claimSchema = new Schema(
  {
    projectId: { type: ObjectId, required: true, index: true },
    humanId: { type: String, required: true }, // "C2"
    text: { type: String, required: true, maxlength: 500 },
    scopeNote: String,
    origin: { type: String, enum: ["user", "ai_from_source", "ai_from_question"], required: true },
    createdBy: { type: ObjectId, ref: "User" },
    status: { type: String, enum: CLAIM_STATUSES, default: "open" }, // from CONFIRMED links
    provisionalStatus: { type: String, enum: CLAIM_STATUSES, default: "open" }, // from ALL links
    gaps: [gapSchema],
    embedding: { type: [Number], select: false },
  },
  { timestamps: true },
);
claimSchema.index({ projectId: 1, humanId: 1 }, { unique: true });
claimSchema.plugin(toJSONPlugin);

export const Claim = mongoose.model("Claim", claimSchema);
