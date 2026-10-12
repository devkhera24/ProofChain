import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireProjectRole } from "../middleware/projectRole.js";
import { aiLimiter } from "../middleware/rateLimits.js";
import { Claim } from "../models/Claim.js";
import { EvidenceLink } from "../models/EvidenceLink.js";
import { AuditEvent } from "../models/AuditEvent.js";
import { createOrMergeClaim } from "../services/claims/claimService.js";
import { scheduleLinking } from "../services/evidence/linker.js";
import { embedOne } from "../services/ai/embeddings.js";
import { recordAudit } from "../services/audit/auditService.js";
import { emitToProject } from "../services/realtime/events.js";
import { notFoundError } from "../utils/errors.js";

// Mounted at /api/projects/:projectId/claims
export const claimsRouter = Router({ mergeParams: true });

const idParam = z.object({
  projectId: z.string(),
  claimId: z.string().refine(mongoose.isValidObjectId, "Invalid claim id"),
});
const createBody = z.object({
  text: z.string().trim().min(10).max(500),
  scopeNote: z.string().trim().max(500).optional(),
});
const patchBody = z
  .object({
    text: z.string().trim().min(10).max(500).optional(),
    scopeNote: z.string().trim().max(500).optional(),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((b) => b.text !== undefined || b.scopeNote !== undefined, "Nothing to update");

const actor = (req) => ({ projectId: req.project._id, actor: req.user.id, actorName: req.user.name });
const target = (claim) => ({ kind: "claim", id: claim._id, humanId: claim.humanId });

async function loadClaim(req) {
  const claim = await Claim.findOne({ _id: req.valid.params.claimId, projectId: req.project._id });
  if (!claim) throw notFoundError("Claim");
  return claim;
}

/** { [claimId]: { total, byStance: {supports: n…}, byStatus: {confirmed: n…} } } in one aggregation. */
async function linkCounts(projectId) {
  const rows = await EvidenceLink.aggregate([
    { $match: { projectId } },
    { $group: { _id: { claimId: "$claimId", stance: "$stance", status: "$status" }, n: { $sum: 1 } } },
  ]);
  const out = {};
  for (const { _id, n } of rows) {
    const c = (out[_id.claimId] ??= { total: 0, byStance: {}, byStatus: {} });
    c.total += n;
    if (_id.status !== "rejected") c.byStance[_id.stance] = (c.byStance[_id.stance] ?? 0) + n; // rejected ≠ evidence
    c.byStatus[_id.status] = (c.byStatus[_id.status] ?? 0) + n;
  }
  return out;
}

claimsRouter.get("/", requireProjectRole("viewer"), async (req, res) => {
  const [claims, counts] = await Promise.all([
    Claim.find({ projectId: req.project._id }).sort({ createdAt: 1, _id: 1 }),
    linkCounts(req.project._id),
  ]);
  const empty = { total: 0, byStance: {}, byStatus: {} };
  res.json({ claims: claims.map((c) => ({ ...c.toJSON(), links: counts[c._id] ?? empty })) });
});

claimsRouter.post("/", requireProjectRole("editor"), aiLimiter, validate({ body: createBody }), async (req, res) => {
  const { claim, merged } = await createOrMergeClaim({
    projectId: req.project._id,
    ...req.valid.body,
    origin: "user",
    userId: req.user.id,
    actorName: req.user.name,
  });
  if (!merged) {
    emitToProject(req.project._id, "claim.updated", { claimId: claim.id });
    scheduleLinking(claim._id);
  }
  res.status(merged ? 200 : 201).json({ claim, merged });
});

claimsRouter.get("/:claimId", requireProjectRole("viewer"), validate({ params: idParam }), async (req, res) => {
  const claim = await loadClaim(req);
  const links = await EvidenceLink.find({ claimId: claim._id })
    .sort({ createdAt: 1, _id: 1 })
    .populate("passageId", "humanId text page paragraph charStart charEnd")
    .populate("sourceId", "title sourceType depth url year");
  res.json({
    claim,
    links: links.map((l) => {
      const { passageId, sourceId, ...rest } = l.toJSON();
      return { ...rest, passage: passageId, source: sourceId };
    }),
  });
});

claimsRouter.patch(
  "/:claimId",
  requireProjectRole("editor"),
  validate({ params: idParam, body: patchBody }),
  async (req, res) => {
    const claim = await loadClaim(req);
    const { text, scopeNote, reason } = req.valid.body;
    const change = {};
    if (text !== undefined && text !== claim.text) {
      change.text = [claim.text, text];
      claim.text = text;
      claim.embedding = await embedOne(text, "SEMANTIC_SIMILARITY");
    }
    if (scopeNote !== undefined && scopeNote !== (claim.scopeNote ?? "")) {
      change.scopeNote = [claim.scopeNote ?? null, scopeNote];
      claim.scopeNote = scopeNote;
    }
    if (Object.keys(change).length) {
      await claim.save();
      await recordAudit({ ...actor(req), action: "claim.updated", target: target(claim), change, reason });
      if (change.text) scheduleLinking(claim._id); // new wording → look for evidence again
      emitToProject(req.project._id, "claim.updated", { claimId: claim.id });
    }
    res.json({ claim });
  },
);

claimsRouter.delete("/:claimId", requireProjectRole("editor"), validate({ params: idParam }), async (req, res) => {
  const claim = await loadClaim(req);
  const { deletedCount } = await EvidenceLink.deleteMany({ claimId: claim._id });
  await claim.deleteOne();
  await recordAudit({
    ...actor(req),
    action: "claim.deleted",
    target: target(claim),
    change: { text: [claim.text, null], links: [deletedCount, 0] },
  });
  emitToProject(req.project._id, "claim.updated", { claimId: claim.id, deleted: true });
  res.status(204).end();
});

claimsRouter.get("/:claimId/history", requireProjectRole("viewer"), validate({ params: idParam }), async (req, res) => {
  const claim = await loadClaim(req);
  const linkIds = await EvidenceLink.find({ claimId: claim._id }).distinct("_id");
  const events = await AuditEvent.find({ projectId: req.project._id, "target.id": { $in: [claim._id, ...linkIds] } })
    .sort({ at: -1, _id: -1 })
    .limit(200);
  res.json({ events });
});
