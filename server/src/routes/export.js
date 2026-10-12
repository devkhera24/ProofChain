import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireProjectRole } from "../middleware/projectRole.js";
import { exportMarkdown, exportBibtex, exportFileName } from "../services/export/exportService.js";

// Mounted at /api/projects/:projectId/export
export const exportRouter = Router({ mergeParams: true });

const FORMATS = {
  md: { type: "text/markdown; charset=utf-8", build: exportMarkdown },
  bib: { type: "application/x-bibtex; charset=utf-8", build: exportBibtex },
};
const query = z.object({ format: z.enum(["md", "bib"]).default("md") });

exportRouter.get("/", requireProjectRole("viewer"), validate({ query }), async (req, res) => {
  const { format } = req.valid.query;
  const body = await FORMATS[format].build(req.project);
  res
    .attachment(exportFileName(req.project, format)) // sets a type from the extension, so the explicit type comes after
    .type(FORMATS[format].type)
    .set("Cache-Control", "no-store")
    .send(body);
});
