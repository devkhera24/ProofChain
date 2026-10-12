import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireProjectRole } from "../middleware/projectRole.js";
import { aiLimiter } from "../middleware/rateLimits.js";
import { RecommendationBatch } from "../models/RecommendationBatch.js";
import { scheduleRecommendation, createBatch } from "../services/recommender/pipeline.js";
import { giveFeedback } from "../services/recommender/feedbackService.js";
import { emitToProject } from "../services/realtime/events.js";
import { AppError, notFoundError } from "../utils/errors.js";

// Mounted at /api/projects/:projectId/recommendations — batches are per user
export const recommendationsRouter = Router({ mergeParams: true });

const STALE_RUNNING_MS = 10 * 60_000; // safety net; interrupted batches are also failed at boot
const batchParams = z.object({ projectId: z.string(), batchId: z.string().refine(mongoose.isValidObjectId, "Invalid batch id") });
const itemParams = batchParams.extend({ index: z.coerce.number().int().min(0).max(4) });
const runBody = z.object({
  trigger: z.enum(["manual", "question", "gap"]).default("manual"),
  triggerText: z.string().trim().max(500).optional(),
});
const feedbackBody = z
  .object({ action: z.enum(["added", "not_relevant", "read", "later"]), reason: z.string().trim().max(300).optional() })
  .refine((b) => b.action !== "not_relevant" || b.reason === undefined || b.reason.length > 0, "Reason cannot be empty");

const own = (req) => ({ projectId: req.project._id, userId: req.user._id });

recommendationsRouter.post("/", requireProjectRole("editor"), aiLimiter, validate({ body: runBody }), async (req, res) => {
  const running = await RecommendationBatch.findOne({
    ...own(req),
    status: "running",
    createdAt: { $gt: new Date(Date.now() - STALE_RUNNING_MS) },
  }).select("_id humanId");
  if (running) throw new AppError(409, `Batch ${running.humanId} is still running`, { batchId: running.id });
  const { trigger, triggerText } = req.valid.body;
  const batch = await createBatch({ ...own(req), trigger, triggerText });
  scheduleRecommendation({ ...own(req), trigger, triggerText, batchId: batch._id });
  res.status(202).json({ batchId: batch.id, humanId: batch.humanId });
});

recommendationsRouter.get("/latest", requireProjectRole("viewer"), async (req, res) => {
  const batch = await RecommendationBatch.findOne(own(req)).sort({ createdAt: -1, _id: -1 });
  res.json({ batch });
});

recommendationsRouter.get("/:batchId", requireProjectRole("viewer"), validate({ params: batchParams }), async (req, res) => {
  const batch = await RecommendationBatch.findOne({ _id: req.valid.params.batchId, ...own(req) });
  if (!batch) throw notFoundError("Batch");
  res.json({ batch });
});

recommendationsRouter.post(
  "/:batchId/items/:index/feedback",
  requireProjectRole("editor"),
  validate({ params: itemParams, body: feedbackBody }),
  async (req, res) => {
    const batch = await RecommendationBatch.findOne({ _id: req.valid.params.batchId, ...own(req) });
    if (!batch) throw notFoundError("Batch");
    if (batch.status !== "ready") throw new AppError(409, "This batch isn't ready yet");
    const { batch: saved, item, rule, source, replaced, note } = await giveFeedback({
      batch,
      index: req.valid.params.index,
      user: req.user,
      ...req.valid.body,
    });
    emitToProject(req.project._id, "batch.updated", { batchId: saved.id });
    res.json({ batch: saved, item, rule: rule ?? null, source: source ?? null, replaced: replaced ?? null, note: note ?? null });
  },
);
