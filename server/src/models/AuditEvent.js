import mongoose from "mongoose";
import { toJSONPlugin } from "./plugins.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// Append-only: no update or delete paths exist anywhere in the app
const auditSchema = new Schema({
  projectId: { type: ObjectId, required: true, index: true },
  at: { type: Date, default: Date.now },
  actor: { type: String, required: true }, // userId string or "system" or "ai"
  actorName: String,
  action: { type: String, required: true }, // e.g. "link.review", "link.discarded", "claim.created"
  target: { kind: String, id: ObjectId, humanId: String },
  change: Schema.Types.Mixed, // { field: [from, to] }
  reason: String,
});
auditSchema.index({ projectId: 1, "target.id": 1, at: -1 });
auditSchema.plugin(toJSONPlugin);

export const AuditEvent = mongoose.model("AuditEvent", auditSchema);
