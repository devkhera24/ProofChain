import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireProjectRole } from "../middleware/projectRole.js";
import { aiLimiter } from "../middleware/rateLimits.js";
import { ChatMessage } from "../models/ChatMessage.js";
import { handleTurn } from "../services/agent/orchestrator.js";

// Mounted at /api/projects/:projectId/chat
export const chatRouter = Router({ mergeParams: true });

const historyQuery = z.object({
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const turnBody = z.object({ message: z.string().trim().min(1).max(2000) });

chatRouter.get("/", requireProjectRole("viewer"), validate({ query: historyQuery }), async (req, res) => {
  const { before, limit } = req.valid.query;
  const filter = { projectId: req.project._id, ...(before && { createdAt: { $lt: before } }) };
  const page = await ChatMessage.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate("userId", "name");
  const hasMore = page.length > limit;
  const messages = page
    .slice(0, limit)
    .reverse() // oldest first for display
    .map((m) => {
      const { userId, ...rest } = m.toJSON();
      return { ...rest, author: userId ? { id: userId.id, name: userId.name } : null };
    });
  res.json({ messages, hasMore });
});

chatRouter.post("/", requireProjectRole("editor"), aiLimiter, validate({ body: turnBody }), async (req, res) => {
  const { userMessage, agentMessage } = await handleTurn({ project: req.project, user: req.user, message: req.valid.body.message });
  res.json({
    userMessage: { ...userMessage.toJSON(), author: { id: req.user.id, name: req.user.name } },
    agentMessage: { ...agentMessage.toJSON(), author: null },
  });
});
