import { RecommendationBatch } from "../../models/RecommendationBatch.js";
import { Project } from "../../models/Project.js";
import { Claim } from "../../models/Claim.js";
import { generateJson } from "../ai/llm.js";
import * as challengerPrompt from "../ai/prompts/challengers.js";
import * as rationalePrompt from "../ai/prompts/rationale.js";
import { matchQuote } from "../validation/textMatch.js";
import { createPipelineLog } from "../validation/pipelineLog.js";
import { verifyPaper } from "../scholarly/verify.js";
import { rankCandidates } from "./rank.js";
import { assignSlots, fillSlot } from "./slots.js";
import { enqueue } from "../../jobs/runner.js";
import { emitToProject } from "../realtime/events.js";
import { nextHumanId } from "../../utils/ids.js";
import { logger } from "../../utils/logger.js";

const CHALLENGER_CANDIDATES = 10;
const MAX_VERIFICATIONS = 15; // L1/L2 only on the shortlist (docs/decisions.md, step 24)

const label = (p) => `"${p.title.slice(0, 60)}" (${p.year ?? "n.d."})`;
const gapTargetsOf = (p) =>
  p.challengeTarget
    ? [p.challengeTarget]
    : p.gapTarget
      ? [{ claimId: p.gapTarget.claimId, humanId: p.gapTarget.humanId, gapType: p.gapTarget.type }]
      : [];

/** Which top candidates contradict or qualify the project's supported claims (validated quotes only). */
async function detectChallengers(ranked, project, log) {
  const claims = await Claim.find({
    projectId: project._id,
    $or: [{ status: "supported" }, { provisionalStatus: "supported" }, { status: "contested" }],
  })
    .select("humanId text")
    .limit(15)
    .lean();
  const top = ranked.slice(0, CHALLENGER_CANDIDATES);
  if (!claims.length || !top.length) return new Set();

  const byTempId = new Map(top.map((p, i) => [`X${i + 1}`, p])); // temporary IDs, never titles
  const input = {
    papers: [...byTempId].map(([id, p]) => ({ id, title: p.title, abstract: p.abstract })),
    claims: claims.map((c) => ({ id: c.humanId, text: c.text })),
  };
  const { results } = await generateJson({
    task: "recommend.challengers",
    system: challengerPrompt.system,
    prompt: challengerPrompt.build(input),
    schema: challengerPrompt.schema,
    check: challengerPrompt.check(input),
    mock: () => challengerPrompt.mock(input),
  });

  const keys = new Set();
  for (const r of results) {
    if (r.relation === "none") continue;
    const paper = byTempId.get(r.paperId);
    const claim = claims.find((c) => c.humanId === r.claimId);
    const m = matchQuote(r.abstractQuote, paper.abstract);
    if (!m.matched) {
      log.drop("L3", `challenger ${label(paper)} vs ${r.claimId}`, "quote_not_in_abstract");
      continue;
    }
    keys.add(paper.key);
    paper.challengeTarget = { claimId: claim._id, humanId: claim.humanId, gapType: r.relation };
    log.pass("L3", `challenger ${label(paper)} ${r.relation} ${r.claimId}`);
  }
  return keys;
}

/** L3: one-sentence rationale grounded in an exact abstract sentence (stored as the ORIGINAL text). */
async function groundRationale(p, slot, ctx, log) {
  const gapText = p.challengeTarget
    ? `may ${p.challengeTarget.gapType === "contradicts" ? "contradict" : "qualify"} claim ${p.challengeTarget.humanId}`
    : p.gapTarget
      ? `${p.gapTarget.type} on ${p.gapTarget.humanId}`
      : null;
  const input = { slot, topics: ctx.topics, gapText, paper: p };
  try {
    const out = await generateJson({
      task: "recommend.rationale",
      system: rationalePrompt.system,
      prompt: rationalePrompt.build(input),
      schema: rationalePrompt.schema,
      mock: () => rationalePrompt.mock(input),
      check: (d) => (matchQuote(d.abstractQuote, p.abstract).matched ? null : "abstractQuote is not in the abstract"),
    });
    const m = matchQuote(out.abstractQuote, p.abstract);
    log.pass("L3", `${label(p)} ${m.matchType}`);
    return { rationale: out.rationale, rationaleQuote: m.original };
  } catch (err) {
    log.retry("L3", label(p), "quote_not_in_abstract");
    log.drop("L3", label(p), err.details?.reason ?? err.message);
    return null;
  }
}

/** accept(p) for the slot filler: L1/L2 verification, then L3 grounding. Bounded number of verifications. */
function makeAccept(ctx, log) {
  let verifications = 0;
  return async (p, slot) => {
    if (verifications >= MAX_VERIFICATIONS) {
      log.drop("L1", label(p), "verification_budget_spent");
      return false;
    }
    verifications++;
    const v = await verifyPaper(p, log);
    if (!v.verified) return false;
    p.verifiedIds = v.verifiedIds;
    const grounded = await groundRationale(p, slot, ctx, log);
    if (!grounded) return false;
    Object.assign(p, grounded);
    return true;
  };
}

const toItem = ({ slot, slotNote, paper: p }) => ({
  slot,
  slotNote,
  paper: {
    ids: p.ids,
    title: p.title,
    authors: p.authors,
    venue: p.venue,
    year: p.year,
    abstract: p.abstract,
    citationCount: p.citationCount,
    oaPdfUrl: p.oaPdfUrl,
    url: p.url,
  },
  score: p.score,
  scoreBreakdown: p.scoreBreakdown,
  gapTargets: gapTargetsOf(p),
  rationale: p.rationale,
  rationaleQuote: p.rationaleQuote,
  groundingPassed: true,
  verifiedIds: p.verifiedIds,
});

/** Rank, detect challengers, and build the slot-filling context shared by full runs and replacements. */
async function prepare({ project, userId, question, log }) {
  const { ranked, ctx } = await rankCandidates({ project, userId, question, log });
  const challengerKeys = ranked.length
    ? await detectChallengers(ranked, project, log).catch((err) => {
        log.info("challengers_skipped", { error: JSON.stringify(err.message) }); // a batch without a CHALLENGER is still useful
        return new Set();
      })
    : new Set();
  const slotCtx = { currentYear: new Date().getFullYear(), challengerKeys };
  return { ranked, ctx, slotCtx };
}

/** Create the batch row (status "running") so callers get its id before the work starts. */
export async function createBatch({ projectId, userId, trigger, triggerText }) {
  const humanId = await nextHumanId(projectId, "batch");
  const batch = await RecommendationBatch.create({ projectId, userId, humanId, trigger, triggerText, status: "running" });
  emitToProject(projectId, "batch.updated", { batchId: batch.id, userId: String(userId), status: "running" });
  return batch;
}

export async function runRecommendation({ projectId, userId, trigger, triggerText, batchId }) {
  const batch = batchId
    ? await RecommendationBatch.findById(batchId)
    : await createBatch({ projectId, userId, trigger, triggerText });
  const { humanId } = batch;
  const log = createPipelineLog(`recommend batch ${humanId}`);
  try {
    const project = await Project.findById(projectId);
    const question = trigger === "question" ? triggerText : null;
    const { ranked, ctx, slotCtx } = await prepare({ project, userId, question, log });
    const picks = ranked.length ? await assignSlots(ranked, slotCtx, makeAccept(ctx, log)) : [];
    batch.items = picks.map(toItem);
    if (batch.items.length < 5) {
      log.info("short_batch", {
        items: batch.items.length,
        why: JSON.stringify(ranked.length ? "not enough candidates passed L1-L3" : "no candidates found"),
      });
    }
    batch.status = "ready";
    log.info("ready", { verified: `${batch.items.length}/5`, grounding: `${batch.items.length}/${batch.items.length}` });
  } catch (err) {
    batch.status = "failed";
    batch.error = err.message;
    log.info("failed", { error: JSON.stringify(err.message) });
    logger.warn({ err, batch: humanId }, "recommendation failed");
  } finally {
    batch.pipelineLog = log.lines;
    await batch.save();
    emitToProject(projectId, "batch.ready", { batchId: batch.id, userId: String(batch.userId), status: batch.status });
  }
  return batch;
}

export const scheduleRecommendation = (args) =>
  enqueue(`recommend:${args.projectId}:${args.userId}`, () => runRecommendation(args));

/** Onboarding: after a project's first source is ready, recommend once for whoever added it. */
export async function maybeOnboard(projectId, userId) {
  if (await RecommendationBatch.exists({ projectId, trigger: "onboarding" })) return;
  const batch = await createBatch({ projectId, userId, trigger: "onboarding" });
  scheduleRecommendation({ projectId, userId, batchId: batch._id });
}

/** Called at boot: batches left "running" by a restart/sleep can't finish; mark them failed. */
export const STALE_BATCH_MS = 10 * 60_000; // a batch normally finishes in well under a minute

/**
 * Batches still "running" after 10 minutes were interrupted (jobs live in memory). Younger ones are left alone:
 * during a zero-downtime deploy the previous instance may still be finishing them.
 */
export async function failInterruptedBatches({ olderThanMs = STALE_BATCH_MS } = {}) {
  const { modifiedCount } = await RecommendationBatch.updateMany(
    { status: "running", createdAt: { $lt: new Date(Date.now() - olderThanMs) } },
    { $set: { status: "failed", error: "Interrupted by a server restart — please run again" } },
  );
  if (modifiedCount) logger.info(`Marked ${modifiedCount} interrupted recommendation batches as failed`);
}

/**
 * Replace one item (after "not relevant"): re-rank (search results are cached), then fill only that slot,
 * skipping every paper already in the batch. Never pads with unverified papers.
 * @returns the new item or null
 */
export async function replaceItem(batch, index, excludeKeys) {
  const log = createPipelineLog(`replace ${batch.humanId} #${index}`);
  const project = await Project.findById(batch.projectId);
  const question = batch.trigger === "question" ? batch.triggerText : null;
  const { ranked, ctx, slotCtx } = await prepare({ project, userId: batch.userId, question, log });
  const slot = batch.items[index].slot;
  const state = {
    used: new Set(excludeKeys),
    selected: ranked.filter((p) => excludeKeys.includes(p.key)),
    picks: {},
  };
  const pick = await fillSlot(slot, ranked, slotCtx, makeAccept(ctx, log), state);
  batch.pipelineLog.push(...log.lines);
  return pick ? toItem({ slot, ...pick }) : null;
}
