import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireProjectRole } from "../middleware/projectRole.js";
import { aiLimiter } from "../middleware/rateLimits.js";
import { Claim } from "../models/Claim.js";
import { Passage } from "../models/Passage.js";
import { EvidenceLink, STANCES, LINK_STATUSES } from "../models/EvidenceLink.js";
import { reviewLink, loadLink } from "../services/evidence/reviewService.js";
import { scheduleLinking } from "../services/evidence/linker.js";
import { recomputeClaimStatus } from "../services/evidence/claimStatus.js";
import { matchQuote } from "../services/validation/textMatch.js";
import { recordAudit } from "../services/audit/auditService.js";
import { emitToProject } from "../services/realtime/events.js";
import { nextHumanId } from "../utils/ids.js";
import { AppError, notFoundError } from "../utils/errors.js";

// Mounted at /api/projects/:projectId/links
export const linksRouter = Router({ mergeParams: true });

const objectId = (what) => z.string().refine(mongoose.isValidObjectId, `Invalid ${what} id`);
const listQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => s?.split(",").filter(Boolean))
    .pipe(z.array(z.enum(LINK_STATUSES)).optional()),
  claimId: objectId("claim").optional(),
  sourceId: objectId("source").optional(),
});
const linkParams = z.object({ projectId: z.string(), linkId: objectId("link") });
const claimParams = z.object({ projectId: z.string(), claimId: objectId("claim") });
const reviewBody = z
  .object({
    status: z.enum(LINK_STATUSES).optional(),
    stance: z.enum(STANCES).optional(),
    scope: z.string().trim().max(200).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.status || b.stance || b.scope !== undefined, "Nothing to change");
const manualBody = z.object({
  claimId: objectId("claim"),
  passageId: objectId("passage"),
  stance: z.enum(STANCES),
  quote: z.string().trim().min(8).max(600),
  scope: z.string().trim().max(200).optional(),
});

const populated = (query) =>
  query
    .populate("claimId", "humanId text status provisionalStatus")
    .populate("passageId", "humanId text page paragraph charStart charEnd")
    .populate("sourceId", "title sourceType depth url year");
const shape = (l) => {
  const { claimId, passageId, sourceId, ...rest } = l.toJSON();
  return { ...rest, claim: claimId, passage: passageId, source: sourceId };
};

linksRouter.get("/", requireProjectRole("viewer"), validate({ query: listQuery }), async (req, res) => {
  const { status, claimId, sourceId } = req.valid.query;
  const filter = { projectId: req.project._id };
  if (status?.length) filter.status = { $in: status };
  if (claimId) filter.claimId = claimId;
  if (sourceId) filter.sourceId = sourceId;
  const links = await populated(EvidenceLink.find(filter).sort({ createdAt: 1, _id: 1 }).limit(500));
  res.json({ links: links.map(shape) });
});

linksRouter.patch(
  "/:linkId",
  requireProjectRole("editor"),
  validate({ params: linkParams, body: reviewBody }),
  async (req, res) => {
    const link = await loadLink(req.project._id, req.valid.params.linkId);
    if (!link) throw notFoundError("Link");
    await reviewLink({ link, user: req.user, ...req.valid.body });
    res.json({ link: shape(await populated(EvidenceLink.findById(link._id))) });
  },
);

linksRouter.post("/", requireProjectRole("editor"), validate({ body: manualBody }), async (req, res) => {
  const { claimId, passageId, stance, quote, scope } = req.valid.body;
  const [claim, passage] = await Promise.all([
    Claim.findOne({ _id: claimId, projectId: req.project._id }),
    Passage.findOne({ _id: passageId, projectId: req.project._id }),
  ]);
  if (!claim) throw notFoundError("Claim");
  if (!passage) throw notFoundError("Passage");
  if (await EvidenceLink.exists({ claimId, passageId })) {
    throw new AppError(409, `${claim.humanId} is already linked to ${passage.humanId}; review that link instead`);
  }
  const m = matchQuote(quote, passage.text); // humans are held to L4 too
  if (!m.matched) throw new AppError(422, `The quote was not found in ${passage.humanId}`, { score: m.score });

  const link = await EvidenceLink.create({
    projectId: req.project._id,
    humanId: await nextHumanId(req.project._id, "link"),
    claimId,
    passageId,
    sourceId: passage.sourceId,
    stance,
    scope,
    status: "confirmed",
    origin: "user",
    quote: m.original,
    matchType: m.matchType,
    matchScore: m.score,
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
  });
  await recordAudit({
    projectId: req.project._id,
    actor: req.user.id,
    actorName: req.user.name,
    action: "link.created",
    target: { kind: "link", id: link._id, humanId: link.humanId },
    change: { claim: [null, claim.humanId], passage: [null, passage.humanId], stance: [null, stance] },
  });
  await recomputeClaimStatus(claim._id);
  emitToProject(req.project._id, "link.updated", { linkId: link.id, claimId: claim.id });
  res.status(201).json({ link: shape(await populated(EvidenceLink.findById(link._id))) });
});

linksRouter.post(
  "/claims/:claimId/run",
  requireProjectRole("editor"),
  aiLimiter,
  validate({ params: claimParams }),
  async (req, res) => {
    const claim = await Claim.findOne({ _id: req.valid.params.claimId, projectId: req.project._id }).select("_id humanId");
    if (!claim) throw notFoundError("Claim");
    scheduleLinking(claim._id);
    res.status(202).json({ claimId: claim.id, humanId: claim.humanId, status: "scheduled" });
  },
);
