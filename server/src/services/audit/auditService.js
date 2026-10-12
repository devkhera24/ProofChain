import { AuditEvent } from "../../models/AuditEvent.js";
import { logger } from "../../utils/logger.js";

/** Never throws: an audit failure must not break the user action, but it is logged loudly. */
export async function recordAudit({ projectId, actor, actorName, action, target, change, reason }) {
  try {
    return await AuditEvent.create({ projectId, actor: String(actor), actorName, action, target, change, reason });
  } catch (err) {
    logger.error({ err, action }, "Failed to write audit event");
  }
}

export const auditHistory = (projectId, targetId, limit = 100) =>
  AuditEvent.find({ projectId, ...(targetId && { "target.id": targetId }) }).sort({ at: -1, _id: -1 }).limit(limit); // _id breaks same-millisecond ties
