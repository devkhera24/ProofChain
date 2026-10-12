import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireProjectRole } from "../middleware/projectRole.js";
import { Comment } from "../models/Comment.js";
import { Claim } from "../models/Claim.js";
import { EvidenceLink } from "../models/EvidenceLink.js";
import { addComment, shapeComment } from "../services/comments/commentService.js";
import { emitToProject } from "../services/realtime/events.js";
import { notFoundError } from "../utils/errors.js";

// Mounted at /api/projects/:projectId/comments
export const commentsRouter = Router({ mergeParams: true });

const objectId = z.string().refine(mongoose.isValidObjectId, "Invalid id");
const TARGET_KINDS = ["link", "claim"];
const targetQuery = z.object({ targetKind: z.enum(TARGET_KINDS), targetId: objectId });
const countsQuery = z.object({ targetKind: z.enum(TARGET_KINDS) });
const postBody = targetQuery.extend({ text: z.string().trim().min(1).max(2000) });
const patchParams = z.object({ projectId: z.string(), commentId: objectId });
const patchBody = z.object({ resolved: z.boolean() });
const MODELS = { link: EvidenceLink, claim: Claim };

commentsRouter.get("/", requireProjectRole("viewer"), validate({ query: targetQuery }), async (req, res) => {
  const { targetKind, targetId } = req.valid.query;
  const comments = await Comment.find({ projectId: req.project._id, "target.kind": targetKind, "target.id": targetId })
    .sort({ createdAt: 1, _id: 1 })
    .limit(500)
    .populate("authorId", "name");
  res.json({ comments: comments.map(shapeComment) });
});

/** { counts: { [targetId]: { total, open } } } for every thread of one kind, so cards can show a count without N requests. */
commentsRouter.get("/counts", requireProjectRole("viewer"), validate({ query: countsQuery }), async (req, res) => {
  const rows = await Comment.aggregate([
    { $match: { projectId: req.project._id, "target.kind": req.valid.query.targetKind } },
    { $group: { _id: "$target.id", total: { $sum: 1 }, open: { $sum: { $cond: ["$resolved", 0, 1] } } } },
  ]);
  res.json({ counts: Object.fromEntries(rows.map((r) => [String(r._id), { total: r.total, open: r.open }])) });
});

commentsRouter.post("/", requireProjectRole("editor"), validate({ body: postBody }), async (req, res) => {
  const { targetKind, targetId, text } = req.valid.body;
  const target = await MODELS[targetKind].findOne({ _id: targetId, projectId: req.project._id }).select("humanId");
  if (!target) throw notFoundError(targetKind === "link" ? "Link" : "Claim");
  const comment = await addComment({
    projectId: req.project._id,
    target: { kind: targetKind, id: target._id, humanId: target.humanId },
    user: req.user,
    text,
  });
  res.status(201).json({ comment });
});

commentsRouter.patch("/:commentId", requireProjectRole("editor"), validate({ params: patchParams, body: patchBody }), async (req, res) => {
  const comment = await Comment.findOneAndUpdate(
    { _id: req.valid.params.commentId, projectId: req.project._id },
    { resolved: req.valid.body.resolved },
    { new: true },
  ).populate("authorId", "name");
  if (!comment) throw notFoundError("Comment");
  emitToProject(req.project._id, "comment.updated", { commentId: comment.id, targetKind: comment.target.kind, targetId: String(comment.target.id) });
  res.json({ comment: shapeComment(comment) });
});
