import { Feedback } from "../../models/Feedback.js";
import { Source } from "../../models/Source.js";
import { fetchUrl } from "../ingestion/fetchUrl.js";
import { extractPdf } from "../ingestion/extractPdf.js";
import { classifySource } from "../ingestion/classifySource.js";
import { scheduleIngestion } from "../ingestion/pipeline.js";
import { addFeedbackRule } from "../profile/profileService.js";
import { recordAudit } from "../audit/auditService.js";
import { paperKey } from "../scholarly/paper.js";
import { allKeys } from "./filter.js";
import { replaceItem } from "./pipeline.js";
import { AppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

/** Turn an accepted recommendation into a project source (full text if an open-access PDF works, else the abstract). */
async function addPaperAsSource(projectId, user, paper) {
  const keys = allKeys(paper.ids);
  const existing = await Source.findOne({
    projectId,
    $or: keys.map((k) => {
      const [kind, ...rest] = k.split(":");
      const field = { doi: "ids.doi", arxiv: "ids.arxivId", s2: "ids.s2Id", oa: "ids.openAlexId" }[kind];
      return { [field]: rest.join(":") };
    }),
  }).select("_id title");
  if (existing) throw new AppError(409, `This paper is already a source ("${existing.title}")`);

  let rawPages = [paper.abstract];
  let depth = "abstract_only";
  let pdfNote = null;
  if (paper.oaPdfUrl) {
    try {
      const { buffer, contentType } = await fetchUrl(paper.oaPdfUrl); // SSRF guard applies
      if (contentType !== "application/pdf") throw new Error(`not a PDF (${contentType || "unknown type"})`);
      rawPages = (await extractPdf(buffer)).pages;
      depth = "full_text";
    } catch (err) {
      pdfNote = `Open-access PDF unavailable (${err.message}); using the abstract`;
      logger.info({ url: paper.oaPdfUrl, err: err.message }, "OA PDF fetch failed, falling back to abstract");
    }
  }
  const source = await Source.create({
    projectId,
    addedBy: user._id,
    kind: "paper",
    url: paper.url ?? undefined,
    ids: paper.ids,
    title: paper.title,
    authors: paper.authors,
    venue: paper.venue ?? undefined,
    year: paper.year ?? undefined,
    sourceType: classifySource({ kind: "paper", hasDoi: Boolean(paper.ids?.doi) }),
    depth,
    rawPages,
    retrievedAt: new Date(),
    status: "queued",
  });
  await recordAudit({
    projectId,
    actor: user.id,
    actorName: user.name,
    action: "source.added",
    target: { kind: "source", id: source._id, humanId: source.title.slice(0, 80) },
    change: { depth: [null, depth] },
    reason: pdfNote ?? "Added from recommendations",
  });
  scheduleIngestion(source._id);
  return { source, pdfNote };
}

/**
 * Record a decision on a recommended paper.
 * @returns {{ batch, item, rule?, source?, replaced?: boolean, note?: string }}
 */
export async function giveFeedback({ batch, index, user, action, reason }) {
  const item = batch.items[index];
  if (!item) throw new AppError(404, "Recommendation not found");
  const key = paperKey(item.paper);

  await Feedback.findOneAndUpdate(
    { projectId: batch.projectId, paperKey: key },
    { $set: { userId: user._id, action, reason } },
    { upsert: true },
  );
  item.feedback = { action, reason, at: new Date(), by: user._id };
  await recordAudit({
    projectId: batch.projectId,
    actor: user.id,
    actorName: user.name,
    action: "recommendation.feedback",
    target: { kind: "batch", id: batch._id, humanId: batch.humanId },
    change: { [item.slot]: [null, action] },
    reason,
  });

  const result = { batch, item };
  if (action === "added") {
    const { source, pdfNote } = await addPaperAsSource(batch.projectId, user, item.paper);
    result.source = source;
    if (pdfNote) result.note = pdfNote;
  }
  if (action === "not_relevant") {
    if (reason) result.rule = await addFeedbackRule(batch.projectId, user._id, { paperTitle: item.paper.title, reason });
    const exclude = batch.items.map((it) => paperKey(it.paper));
    const replacement = await replaceItem(batch, index, exclude);
    if (replacement) {
      batch.items[index] = replacement;
      result.item = replacement;
      result.replaced = true;
    } else {
      result.replaced = false;
      result.note = "No other verified paper was available for this slot.";
    }
  }
  batch.markModified("items");
  await batch.save();
  return result;
}
