import { EvidenceLink } from "../../models/EvidenceLink.js";
import { recomputeClaimStatus } from "./claimStatus.js";
import { recordAudit } from "../audit/auditService.js";
import { emitToProject } from "../realtime/events.js";
import { AppError } from "../../utils/errors.js";

export const TRANSITIONS = {
  ai_suggested: ["under_review", "confirmed", "rejected", "disputed"],
  under_review: ["confirmed", "rejected", "disputed"],
  confirmed: ["disputed", "rejected", "under_review"],
  rejected: ["under_review", "confirmed"],
  disputed: ["confirmed", "rejected", "under_review"],
};

/**
 * Human review (L6). Changes status and/or stance/scope, audits the change, recomputes the claim status.
 * Editing stance/scope alone also marks the link reviewed (it leaves `ai_suggested`, so the linker never
 * overwrites a human's edit).
 */
export async function reviewLink({ link, user, status, stance, scope, reason }) {
  const from = { status: link.status, stance: link.stance, scope: link.scope ?? null };
  const stanceChanged = stance !== undefined && stance !== link.stance;
  const scopeChanged = scope !== undefined && (scope || null) !== from.scope;
  let to = status ?? link.status;
  if (to === link.status && (stanceChanged || scopeChanged) && link.status === "ai_suggested") to = "under_review";

  if (to !== link.status && !TRANSITIONS[link.status].includes(to)) {
    throw new AppError(409, `Cannot move a link from ${link.status} to ${to}`);
  }
  if (to === link.status && !stanceChanged && !scopeChanged) return { link, changed: false };

  const needsReason = ["rejected", "disputed"].includes(to) && to !== link.status;
  if ((needsReason || (stanceChanged && link.origin === "ai")) && !reason?.trim()) {
    throw new AppError(400, "A reason is required for this change", {
      field: "reason",
      why: needsReason ? `moving to ${to}` : "changing the stance of an AI suggestion",
    });
  }

  const change = {};
  if (to !== link.status) change.status = [link.status, to];
  if (stanceChanged) change.stance = [link.stance, stance];
  if (scopeChanged) change.scope = [from.scope, scope || null];

  link.status = to;
  if (stanceChanged) link.stance = stance;
  if (scopeChanged) link.scope = scope || undefined;
  link.reviewedBy = user._id;
  link.reviewedAt = new Date();
  await link.save();

  await recordAudit({
    projectId: link.projectId,
    actor: user.id,
    actorName: user.name,
    action: "link.review",
    target: { kind: "link", id: link._id, humanId: link.humanId },
    change,
    reason: reason?.trim() || undefined,
  });
  await recomputeClaimStatus(link.claimId);
  emitToProject(link.projectId, "link.updated", { linkId: link.id, claimId: String(link.claimId) });
  return { link, changed: true };
}

export const loadLink = (projectId, linkId) => EvidenceLink.findOne({ _id: linkId, projectId });
