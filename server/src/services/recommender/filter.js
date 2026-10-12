import { Source } from "../../models/Source.js";
import { Feedback } from "../../models/Feedback.js";
import { normTitle } from "../validation/metadata.js";
import { cosine } from "../../utils/vectors.js";

export const HARD_EXCLUSION_SIM = 0.75;

/** Every key a paper could have been stored under (feedback rows use paperKey, which prefers the DOI). */
export const allKeys = (ids = {}) =>
  [
    ids.doi && `doi:${ids.doi}`,
    ids.arxivId && `arxiv:${ids.arxivId}`,
    ids.s2Id && `s2:${ids.s2Id}`,
    ids.openAlexId && `oa:${ids.openAlexId}`,
  ].filter(Boolean);

/** Everything the project already has or has decided about. */
export async function loadKnown(projectId) {
  const [sources, feedback] = await Promise.all([
    Source.find({ projectId }).select("ids title").lean(),
    Feedback.find({ projectId, action: { $in: ["not_relevant", "added"] } }).select("paperKey action").lean(),
  ]);
  return {
    sourceKeys: new Set(sources.flatMap((s) => allKeys(s.ids))),
    sourceTitles: new Set(sources.map((s) => normTitle(s.title)).filter((t) => t.length > 10)),
    feedback: new Map(feedback.map((f) => [f.paperKey, f.action])),
  };
}

/**
 * Cheap filters (before embedding): already in the project, already decided, no abstract (L3 needs one).
 * @returns kept papers; every drop is logged.
 */
export function filterKnown(papers, known, log) {
  return papers.filter((p) => {
    const keys = allKeys(p.ids);
    const label = `"${p.title.slice(0, 60)}"`;
    if (keys.some((k) => known.sourceKeys.has(k)) || known.sourceTitles.has(normTitle(p.title))) {
      log.drop("filter", label, "already_in_project");
      return false;
    }
    const decided = keys.map((k) => known.feedback.get(k)).find(Boolean);
    if (decided) {
      log.drop("filter", label, decided === "added" ? "already_added" : "marked_not_relevant");
      return false;
    }
    if (!p.abstract || p.abstract.length < 50) {
      log.drop("filter", label, "no_abstract");
      return false;
    }
    return true;
  });
}

/** After embedding: hard exclusions remove papers; soft ones only lower the score (scoring.js). */
export function filterHardExclusions(papers, hardExclusions, log) {
  if (!hardExclusions.length) return papers;
  return papers.filter((p) => {
    const hit = hardExclusions.find((e) => cosine(p.embedding, e.embedding) >= HARD_EXCLUSION_SIM);
    if (hit) log.drop("filter", `"${p.title.slice(0, 60)}"`, `hard_exclusion(${hit.concept})`);
    return !hit;
  });
}
