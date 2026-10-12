import crypto from "node:crypto";
import { Source } from "../../models/Source.js";
import { Passage } from "../../models/Passage.js";
import { fetchUrl } from "./fetchUrl.js";
import { extractHtml } from "./extractHtml.js";
import { extractPdf } from "./extractPdf.js";
import { joinPages } from "./normalize.js";
import { chunkText } from "./chunk.js";
import { classifySource } from "./classifySource.js";
import { embedTexts } from "../ai/embeddings.js";
import { reserveHumanIds } from "../../utils/ids.js";
import { enqueue } from "../../jobs/runner.js";
import { extractClaimsFromSource } from "../claims/claimService.js";
import { scheduleLinking } from "../evidence/linker.js";
import { Claim } from "../../models/Claim.js";
import { scheduleProjectProfiles } from "../profile/profileService.js";
import { emitToProject } from "../realtime/events.js"; // no-op stub until Step 29
import { logger } from "../../utils/logger.js";

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function scheduleIngestion(sourceId) {
  return enqueue(`ingest:${sourceId}`, () => ingestSource(sourceId));
}

/** Idempotent: can be re-run after a crash. */
export async function ingestSource(sourceId) {
  const source = await Source.findById(sourceId).select("+rawPages");
  if (!source || source.status === "ready") return;
  await setStatus(source, "processing");

  try {
    // 1. Extract (URLs are fetched here; PDFs/papers already have rawPages from the request)
    if (!source.rawPages?.length) {
      if (source.kind !== "url") throw new Error("Original upload is no longer available — please re-upload the PDF");
      const { finalUrl, contentType, buffer } = await fetchUrl(source.url);
      const extracted =
        contentType === "application/pdf" ? await extractPdf(buffer) : extractHtml(buffer.toString("utf8"), finalUrl);
      source.rawPages = extracted.pages;
      source.title = extracted.title ?? source.title;
      if (extracted.byline) source.authors = [extracted.byline];
      if (extracted.publishedTime) source.year = new Date(extracted.publishedTime).getFullYear() || source.year;
      source.sourceType =
        source.sourceType === "unknown" ? classifySource({ url: finalUrl, kind: "url" }) : source.sourceType;
      source.retrievedAt = new Date();
      await source.save();
    }

    // 2. Normalise + snapshot hash (duplicate detection inside the project)
    const { text, pageStarts } = joinPages(source.rawPages);
    const textHash = sha256(text);
    const dup = await Source.findOne({ projectId: source.projectId, textHash, _id: { $ne: source._id } }).select("title");
    if (dup) throw new Error(`This document is already in the project ("${dup.title}")`);

    // 3. Chunk
    const chunks = chunkText(text, pageStarts);
    if (!chunks.length) throw new Error("No passages could be extracted");

    // 4. Embed (the expensive part)
    const vectors = await embedTexts(
      chunks.map((c) => c.text),
      "RETRIEVAL_DOCUMENT",
    );

    // 5. Replace passages atomically-enough (re-runs delete partial results first)
    if (!(await Source.exists({ _id: source._id }))) return; // deleted while embedding → don't leave orphans
    await Passage.deleteMany({ sourceId: source._id });
    const ids = await reserveHumanIds(source.projectId, "passage", chunks.length);
    await Passage.insertMany(
      chunks.map((c, i) => ({
        ...c,
        projectId: source.projectId,
        sourceId: source._id,
        humanId: ids[i],
        embedding: vectors[i],
      })),
    );

    Object.assign(source, { text, pageStarts, textHash, passageCount: chunks.length, status: "ready", error: undefined });
    source.rawPages = undefined; // free space; `text` is the canonical snapshot now
    await source.save();
    emitToProject(source.projectId, "source.updated", { sourceId: source.id, status: "ready" });

    // 6. Follow-ups: re-link the existing claims against only this new source, then extract new claims
    //    (claims extracted from it are linked against every source by extractClaimsFromSource)
    const existingClaims = await Claim.find({ projectId: source.projectId }).select("_id").lean();
    existingClaims.forEach((c) => scheduleLinking(c._id, { sourceIds: [String(source._id)] }));
    enqueue(`claims:${source.id}`, () => extractClaimsFromSource(source._id));
    await scheduleProjectProfiles(source.projectId); // new passages shift every member's interest profile
  } catch (err) {
    logger.warn({ err: err.message, sourceId }, "ingestion failed");
    if (!(await Source.exists({ _id: source._id }))) return; // deleted while processing
    source.status = "failed";
    source.error = err.message?.slice(0, 300) ?? "Ingestion failed";
    await source.save();
    emitToProject(source.projectId, "source.updated", { sourceId: source.id, status: "failed" });
  }
}

async function setStatus(source, status) {
  source.status = status;
  await source.save();
  emitToProject(source.projectId, "source.updated", { sourceId: source.id, status });
}

/** Called at boot: jobs interrupted by a Render restart/sleep are resumed. */
export async function resumeInterruptedJobs() {
  const stuck = await Source.find({ status: { $in: ["queued", "processing"] } }).select("_id");
  stuck.forEach((s) => scheduleIngestion(s._id));
  if (stuck.length) logger.info(`Resuming ${stuck.length} interrupted ingestion jobs`);
}
