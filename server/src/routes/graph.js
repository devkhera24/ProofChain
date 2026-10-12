import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireProjectRole } from "../middleware/projectRole.js";
import { Claim } from "../models/Claim.js";
import { EvidenceLink } from "../models/EvidenceLink.js";

// Mounted at /api/projects/:projectId/graph — Cytoscape-ready elements
export const graphRouter = Router({ mergeParams: true });

export const MAX_ELEMENTS = 400;
const objectId = z.string().refine(mongoose.isValidObjectId, "Invalid id");
const query = z.object({
  claimId: objectId.optional(),
  sourceId: objectId.optional(),
  status: z.enum(["unreviewed", "confirmed", "disputed", "ai_suggested", "under_review"]).optional(), // unreviewed = ai_suggested + disputed
  contested: z.enum(["true", "false"]).optional(),
});

graphRouter.get("/", requireProjectRole("viewer"), validate({ query }), async (req, res) => {
  const { claimId, sourceId, status, contested } = req.valid.query;
  const projectId = req.project._id;

  const claimFilter = { projectId };
  if (claimId) claimFilter._id = claimId;
  if (contested === "true") claimFilter.$or = [{ status: "contested" }, { provisionalStatus: "contested" }];
  const claims = await Claim.find(claimFilter).sort({ createdAt: 1, _id: 1 }).select("humanId text status provisionalStatus gaps").lean();

  const linkFilter = { projectId, claimId: { $in: claims.map((c) => c._id) }, status: { $ne: "rejected" } };
  if (status === "unreviewed") linkFilter.status = { $in: ["ai_suggested", "disputed"] };
  else if (status) linkFilter.status = status;
  if (sourceId) linkFilter.sourceId = sourceId;
  const links = await EvidenceLink.find(linkFilter)
    .sort({ claimId: 1, createdAt: 1 })
    .populate("passageId", "humanId text page sourceId")
    .populate("sourceId", "title sourceType")
    .lean();

  // With a status/source filter, only claims that have matching links are shown
  const linkedClaims = new Set(links.map((l) => String(l.claimId)));
  const shownClaims = status || sourceId ? claims.filter((c) => linkedClaims.has(String(c._id))) : claims;

  const elements = [];
  let truncated = false;
  const room = (n) => {
    if (elements.length + n > MAX_ELEMENTS) truncated = true;
    return !truncated;
  };

  const claimIds = new Set();
  for (const c of shownClaims) {
    if (!room(1)) break;
    claimIds.add(String(c._id));
    elements.push({
      data: {
        id: `claim:${c._id}`,
        kind: "claim",
        label: c.humanId,
        text: c.text,
        status: c.status,
        provisionalStatus: c.provisionalStatus,
        gapCount: c.gaps?.length ?? 0,
      },
    });
  }

  const passageIds = new Set();
  for (const l of links) {
    if (!claimIds.has(String(l.claimId)) || !l.passageId || !l.sourceId) continue;
    const pid = String(l.passageId._id);
    const newPassage = !passageIds.has(pid);
    if (!room(newPassage ? 2 : 1)) break;
    if (newPassage) {
      passageIds.add(pid);
      elements.push({
        data: {
          id: `passage:${pid}`,
          kind: "passage",
          label: l.passageId.humanId,
          text: l.passageId.text,
          page: l.passageId.page ?? null,
          sourceId: String(l.sourceId._id),
          sourceTitle: l.sourceId.title,
          sourceType: l.sourceId.sourceType,
        },
      });
    }
    elements.push({
      data: {
        id: `link:${l._id}`,
        source: `passage:${pid}`,
        target: `claim:${l.claimId}`,
        linkId: String(l._id),
        label: l.humanId,
        stance: l.stance,
        status: l.status,
        scope: l.scope ?? null,
      },
    });
  }

  res.json({ elements, truncated, counts: { claims: claimIds.size, passages: passageIds.size, links: elements.length - claimIds.size - passageIds.size } });
});
