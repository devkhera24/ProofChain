import { Claim } from "../../models/Claim.js";
import { EvidenceLink } from "../../models/EvidenceLink.js";
import { Source } from "../../models/Source.js";
import { buildMarkdown } from "./markdown.js";
import { buildBibtex } from "./bibtex.js";

const slug = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "project";

export const exportFileName = (project, ext, date = new Date()) => `proofchain-${slug(project.name)}-${date.toISOString().slice(0, 10)}.${ext}`;

const loadSources = (projectId) => Source.find({ projectId }).sort({ createdAt: 1, _id: 1 }).lean();

export async function exportMarkdown(project) {
  const [claims, rawLinks, sources] = await Promise.all([
    Claim.find({ projectId: project._id }).lean(),
    EvidenceLink.find({ projectId: project._id, status: { $ne: "rejected" } })
      .sort({ createdAt: 1, _id: 1 })
      .populate("passageId", "humanId page")
      .populate("sourceId", "title")
      .lean(),
    loadSources(project._id),
  ]);
  const links = rawLinks.map(({ passageId, sourceId, ...l }) => ({ ...l, passage: passageId, source: sourceId }));
  return buildMarkdown({ project, claims, links, sources });
}

export async function exportBibtex(project) {
  return buildBibtex(await loadSources(project._id));
}
