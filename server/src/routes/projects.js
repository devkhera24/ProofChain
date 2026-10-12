import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/projectRole.js";
import { apiLimiter } from "../middleware/rateLimits.js";
import mongoose from "mongoose";
import { ROLES } from "../models/Project.js";
import * as projects from "../services/projects/projectService.js";
import { auditRouter } from "./audit.js";
import { sourcesRouter } from "./sources.js";
import { claimsRouter } from "./claims.js";
import { linksRouter } from "./links.js";
import { profileRouter } from "./profile.js";
import { recommendationsRouter } from "./recommendations.js";
import { chatRouter } from "./chat.js";
import { graphRouter } from "./graph.js";
import { commentsRouter } from "./comments.js";
import { exportRouter } from "./export.js";

export const projectsRouter = Router({ mergeParams: true });
projectsRouter.use(requireAuth);
projectsRouter.use(apiLimiter);
projectsRouter.use("/:projectId/audit", auditRouter);
projectsRouter.use("/:projectId/sources", sourcesRouter);
projectsRouter.use("/:projectId/claims", claimsRouter);
projectsRouter.use("/:projectId/links", linksRouter);
projectsRouter.use("/:projectId/profile", profileRouter);
projectsRouter.use("/:projectId/recommendations", recommendationsRouter);
projectsRouter.use("/:projectId/chat", chatRouter);
projectsRouter.use("/:projectId/graph", graphRouter);
projectsRouter.use("/:projectId/comments", commentsRouter);
projectsRouter.use("/:projectId/export", exportRouter);

const LEVELS = ["beginner", "intermediate", "advanced"];
const fields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000),
  topics: z.array(z.string().trim().min(1).max(80)).max(10),
  level: z.enum(LEVELS),
  goal: z.string().trim().max(300),
};
const createBody = z.object(fields).partial().required({ name: true });
const updateBody = z
  .object(fields)
  .partial()
  .refine((b) => Object.keys(b).length > 0, "Nothing to update");
const memberBody = z.object({ email: z.string().trim().email(), role: z.enum(ROLES) });
const memberParams = z.object({ projectId: z.string(), userId: z.string().refine(mongoose.isValidObjectId, "Invalid user id") });

projectsRouter.get("/", async (req, res) => {
  res.json({ projects: await projects.listProjects(req.user) });
});

projectsRouter.post("/", validate({ body: createBody }), async (req, res) => {
  res.status(201).json({ project: await projects.createProject(req.user, req.valid.body) });
});

projectsRouter.get("/:projectId", requireProjectRole("viewer"), async (req, res) => {
  res.json({ project: await projects.getProject(req.project), role: req.role });
});

projectsRouter.patch("/:projectId", requireProjectRole("editor"), validate({ body: updateBody }), async (req, res) => {
  res.json({ project: await projects.updateProject(req.project, req.valid.body) });
});

projectsRouter.post("/:projectId/members", requireProjectRole("owner"), validate({ body: memberBody }), async (req, res) => {
  res.status(201).json({ project: await projects.addMember(req.project, req.valid.body) });
});

projectsRouter.delete(
  "/:projectId/members/:userId",
  requireProjectRole("owner"),
  validate({ params: memberParams }),
  async (req, res) => {
    res.json({ project: await projects.removeMember(req.project, req.valid.params.userId) });
  },
);
