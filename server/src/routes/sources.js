import { Router } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { z } from "zod";
import { env } from "../config/env.js";
import { validate } from "../middleware/validate.js";
import { requireProjectRole } from "../middleware/projectRole.js";
import { Source } from "../models/Source.js";
import { Passage } from "../models/Passage.js";
import { EvidenceLink } from "../models/EvidenceLink.js";
import { extractPdf } from "../services/ingestion/extractPdf.js";
import { scheduleIngestion } from "../services/ingestion/pipeline.js";
import { recordAudit } from "../services/audit/auditService.js";
import { emitToProject } from "../services/realtime/events.js";
import { AppError, notFoundError } from "../utils/errors.js";

// Mounted at /api/projects/:projectId/sources
export const sourcesRouter = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(), // never write to Render's disk
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    file.mimetype === "application/pdf" ? cb(null, true) : cb(new AppError(415, "Only PDF files are supported")),
});

const SOURCE_TYPES = Source.schema.path("sourceType").enumValues;
const idParam = z.object({
  projectId: z.string(),
  sourceId: z.string().refine(mongoose.isValidObjectId, "Invalid source id"),
});
const urlBody = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs are allowed"),
});
const patchBody = z
  .object({ sourceType: z.enum(SOURCE_TYPES), title: z.string().trim().min(1).max(300) })
  .partial()
  .refine((b) => Object.keys(b).length > 0, "Nothing to update");
const passagesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const actor = (req) => ({ projectId: req.project._id, actor: req.user.id, actorName: req.user.name });
const target = (source) => ({ kind: "source", id: source._id, humanId: source.title?.slice(0, 80) });

/** Loads the source and checks it belongs to this project (404 otherwise). */
async function loadSource(req, select) {
  const query = Source.findOne({ _id: req.valid.params.sourceId, projectId: req.project._id });
  const source = await (select ? query.select(select) : query);
  if (!source) throw notFoundError("Source");
  return source;
}

sourcesRouter.post("/", requireProjectRole("editor"), validate({ body: urlBody }), async (req, res) => {
  const source = await Source.create({
    projectId: req.project._id,
    addedBy: req.user._id,
    kind: "url",
    url: req.valid.body.url,
    title: req.valid.body.url,
    status: "queued",
  });
  await recordAudit({ ...actor(req), action: "source.added", target: target(source) });
  scheduleIngestion(source._id);
  res.status(202).json({ source });
});

sourcesRouter.post("/upload", requireProjectRole("editor"), upload.single("file"), async (req, res) => {
  if (!req.file) throw new AppError(400, "No file uploaded");
  const { title, pages, truncated } = await extractPdf(req.file.buffer);
  const source = await Source.create({
    projectId: req.project._id,
    addedBy: req.user._id,
    kind: "pdf",
    fileName: req.file.originalname,
    title: title ?? req.file.originalname.replace(/\.pdf$/i, ""),
    rawPages: pages,
    retrievedAt: new Date(),
    status: "queued",
  });
  await recordAudit({ ...actor(req), action: "source.added", target: target(source) });
  scheduleIngestion(source._id);
  res.status(202).json({ source, truncated });
});

sourcesRouter.get("/", requireProjectRole("viewer"), async (req, res) => {
  const sources = await Source.find({ projectId: req.project._id }).sort({ createdAt: -1, _id: -1 });
  res.json({ sources });
});

sourcesRouter.get("/:sourceId", requireProjectRole("viewer"), validate({ params: idParam }), async (req, res) => {
  res.json({ source: await loadSource(req, "+text +pageStarts") });
});

sourcesRouter.get(
  "/:sourceId/passages",
  requireProjectRole("viewer"),
  validate({ params: idParam, query: passagesQuery }),
  async (req, res) => {
    const source = await loadSource(req);
    const { page, limit } = req.valid.query;
    const filter = { sourceId: source._id };
    const [passages, total] = await Promise.all([
      Passage.find(filter).sort({ charStart: 1 }).skip((page - 1) * limit).limit(limit),
      Passage.countDocuments(filter),
    ]);
    res.json({ passages, total, page, limit });
  },
);

sourcesRouter.patch(
  "/:sourceId",
  requireProjectRole("editor"),
  validate({ params: idParam, body: patchBody }),
  async (req, res) => {
    const source = await loadSource(req);
    const change = {};
    for (const [field, value] of Object.entries(req.valid.body)) {
      if (source[field] !== value) change[field] = [source[field], value];
    }
    source.set(req.valid.body);
    await source.save();
    if (Object.keys(change).length) {
      await recordAudit({ ...actor(req), action: "source.updated", target: target(source), change });
      emitToProject(source.projectId, "source.updated", { sourceId: source.id, status: source.status });
    }
    res.json({ source });
  },
);

sourcesRouter.post("/:sourceId/retry", requireProjectRole("editor"), validate({ params: idParam }), async (req, res) => {
  const source = await loadSource(req);
  if (source.status !== "failed") throw new AppError(409, "Only failed sources can be retried");
  source.status = "queued";
  source.error = undefined;
  await source.save();
  await recordAudit({ ...actor(req), action: "source.retried", target: target(source) });
  scheduleIngestion(source._id);
  res.status(202).json({ source });
});

sourcesRouter.delete("/:sourceId", requireProjectRole("editor"), validate({ params: idParam }), async (req, res) => {
  const source = await loadSource(req);
  const [passages, links] = await Promise.all([
    Passage.deleteMany({ sourceId: source._id }),
    EvidenceLink.deleteMany({ sourceId: source._id }),
  ]);
  await source.deleteOne();
  await recordAudit({
    ...actor(req),
    action: "source.deleted",
    target: target(source),
    change: { passages: [passages.deletedCount, 0], links: [links.deletedCount, 0] },
  });
  emitToProject(source.projectId, "source.deleted", { sourceId: source.id });
  res.status(204).end();
});
