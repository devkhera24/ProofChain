import { Claim } from "../../models/Claim.js";
import { Passage } from "../../models/Passage.js";
import { Source } from "../../models/Source.js";
import { InterestProfile } from "../../models/InterestProfile.js";
import { generateJson } from "../ai/gemini.js";
import { embedTexts } from "../ai/embeddings.js";
import * as queryPrompt from "../ai/prompts/searchQueries.js";
import { ensureProfile, recomputeProfileVector } from "../profile/profileService.js";
import { paperKey } from "../scholarly/paper.js";
import { fetchCandidates } from "./candidates.js";
import { loadKnown, filterKnown, filterHardExclusions } from "./filter.js";
import { preSort, scorePapers } from "./scoring.js";

const QUERY_GAPS = 3; // gaps turned into search queries
const SCORING_GAPS = 8; // gaps used for the gap-alignment score
const SEEN_SOURCES = 20;
const paperText = (p) => `${p.title}. ${p.abstract ?? ""}`.slice(0, 1500);

/** Everything the recommender needs to know about the project and the user. */
export async function loadContext({ project, userId, question }) {
  await ensureProfile(project._id, userId);
  let profile = await InterestProfile.findOne({ projectId: project._id, userId }).select("+vector +exclusions.embedding");
  if (!profile.vector?.length) profile = await recomputeProfileVector(project._id, userId); // first run

  const claims = await Claim.find({ projectId: project._id, "gaps.0": { $exists: true } }).select("humanId gaps").lean();
  const gaps = claims
    .flatMap((c) => c.gaps.map((g) => ({ ...g, claimId: c._id, claimHumanId: c.humanId, humanId: c.humanId })))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, SCORING_GAPS);

  // Papers already in the project: near-duplicates of them (e.g. a preprint of an added paper) get a penalty
  const paperSources = await Source.find({ projectId: project._id, kind: "paper" }).select("_id").sort({ createdAt: -1 }).limit(SEEN_SOURCES).lean();
  const seen = paperSources.length
    ? await Passage.aggregate([
        { $match: { sourceId: { $in: paperSources.map((s) => s._id) } } },
        { $sort: { charStart: 1 } },
        { $group: { _id: "$sourceId", embedding: { $first: "$embedding" } } },
      ])
    : [];

  return {
    project,
    question: question?.trim() || null,
    topics: project.topics ?? [],
    profileVec: profile.vector ?? [],
    exclusions: profile.exclusions ?? [],
    gaps,
    seenEmbeddings: seen.map((s) => s.embedding).filter((e) => e?.length),
  };
}

/**
 * Pipeline A (design doc steps 1–5): queries → fetch → dedupe → filter → pre-sort & cap → embed → score.
 * Verification (L1/L2) happens on the shortlist in pipeline B.
 * @returns {{ ranked: Array, ctx: object, queries: Array }}
 */
export async function rankCandidates({ project, userId, question, log }) {
  const ctx = await loadContext({ project, userId, question });
  log.info("context", {
    question: ctx.question ? "yes" : "no",
    topics: ctx.topics.length,
    gaps: ctx.gaps.length,
    exclusions: ctx.exclusions.length,
  });

  // 1. Queries
  const queryInput = {
    question: ctx.question,
    topics: ctx.topics,
    gaps: ctx.gaps.slice(0, QUERY_GAPS),
    exclusions: ctx.exclusions,
  };
  const { queries } = await generateJson({
    task: "recommend.queries",
    system: queryPrompt.system,
    prompt: queryPrompt.build(queryInput),
    schema: queryPrompt.schema,
    check: queryPrompt.check(queryInput),
    mock: () => queryPrompt.mock(queryInput),
  });
  log.info("queries", { list: JSON.stringify(queries.map((q) => q.q)) });

  // 2–3. Fetch + dedupe, then cheap filters and cap
  const fetched = await fetchCandidates({ queries, project, log });
  const known = await loadKnown(project._id);
  const kept = filterKnown(fetched, known, log);
  const pool = preSort(kept);
  log.info("pool", { afterFilter: kept.length, embedded: pool.length });
  if (!pool.length) return { ranked: [], ctx, queries };

  // 4. Embed papers, the question and the gap hints (two batched calls)
  const [paperVecs, queryVecs] = await Promise.all([
    embedTexts(pool.map(paperText), "RETRIEVAL_DOCUMENT"),
    embedTexts([...(ctx.question ? [ctx.question] : []), ...ctx.gaps.map((g) => g.queryHint)], "RETRIEVAL_QUERY"),
  ]);
  pool.forEach((p, i) => {
    p.embedding = paperVecs[i];
    p.key = paperKey(p);
  });
  const questionVec = ctx.question ? queryVecs[0] : null;
  const gapVecs = queryVecs.slice(ctx.question ? 1 : 0);
  const gaps = ctx.gaps.map((g, i) => ({ ...g, embedding: gapVecs[i] }));

  // 5. Hard exclusions, then score
  const hard = ctx.exclusions.filter((e) => e.strength === "hard" && e.embedding?.length);
  const allowed = filterHardExclusions(pool, hard, log);
  const ranked = scorePapers(allowed, {
    questionVec,
    profileVec: ctx.profileVec,
    gaps,
    softExclusions: ctx.exclusions.filter((e) => e.strength === "soft" && e.embedding?.length),
    seenEmbeddings: ctx.seenEmbeddings,
  });
  log.info("scored", { count: ranked.length, top: ranked[0]?.score ?? 0 });
  return { ranked, ctx: { ...ctx, gaps, questionVec }, queries };
}
