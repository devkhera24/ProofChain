import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/projectRole.js";
import { ROLES } from "../models/Project.js";
import * as projects from "../services/projects/projectService.js";

export const projectsRouter = Router({ mergeParams: true });
projectsRouter.use(requireAuth);

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
const memberParams = z.object({ projectId: z.string(), userId: z.string() });

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
