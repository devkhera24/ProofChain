import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { validate } from "../middleware/validate.js";
import { requireProjectRole } from "../middleware/projectRole.js";
import { auditHistory } from "../services/audit/auditService.js";

// Mounted at /api/projects/:projectId/audit. Read-only: audit events are never updated or deleted.
export const auditRouter = Router({ mergeParams: true });

const query = z.object({
  targetId: z.string().refine(mongoose.isValidObjectId, "Invalid id").optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

auditRouter.get("/", requireProjectRole("viewer"), validate({ query }), async (req, res) => {
  const { targetId, limit } = req.valid.query;
  res.json({ events: await auditHistory(req.project._id, targetId, limit) });
});
