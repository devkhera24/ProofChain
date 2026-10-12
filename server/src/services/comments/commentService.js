import { Comment } from "../../models/Comment.js";
import { recordAudit } from "../audit/auditService.js";
import { emitToProject } from "../realtime/events.js";

/** Comment with the author's name, as the client shows it. */
export const shapeComment = (c) => {
  const json = c.toJSON();
  const author = c.populated("authorId") ? c.authorId : null;
  return { ...json, authorId: author ? author.id : json.authorId, authorName: author?.name ?? null };
};

/**
 * Add a comment to a link or claim thread, audit it, and tell everyone in the project.
 * `target` = { kind: "link"|"claim", id, humanId }.
 */
export async function addComment({ projectId, target, user, text, resolved = false }) {
  const comment = await Comment.create({ projectId, target: { kind: target.kind, id: target.id }, authorId: user._id, text, resolved });
  await recordAudit({
    projectId,
    actor: user.id,
    actorName: user.name,
    action: "comment.added",
    target: { kind: target.kind, id: target.id, humanId: target.humanId },
    change: { comment: [null, text.length > 120 ? `${text.slice(0, 117)}…` : text] },
  });
  emitToProject(projectId, "comment.added", { commentId: comment.id, targetKind: target.kind, targetId: String(target.id) });
  await comment.populate("authorId", "name");
  return shapeComment(comment);
}

/** Close every open comment on a thread (used when a dispute is resolved). */
export async function resolveThread(projectId, target) {
  await Comment.updateMany({ projectId, "target.kind": target.kind, "target.id": target.id, resolved: false }, { resolved: true });
}
