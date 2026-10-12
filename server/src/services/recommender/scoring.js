import { cosine } from "../../utils/vectors.js";

export const WEIGHTS = { question: 0.4, profile: 0.2, gap: 0.25, quality: 0.1, access: 0.05 };
export const POOL_CAP = 60;

const age = (p, currentYear) => Math.max(1, currentYear - (p.year ?? currentYear) + 1);

export function qualityScore(paper, maxCitesPerYear, currentYear) {
  const perYear = (paper.citationCount ?? 0) / age(paper, currentYear);
  return maxCitesPerYear > 0 ? Math.log1p(perYear) / Math.log1p(maxCitesPerYear) : 0;
}

/** Cheap pre-sort before embedding: search rank first, then citations per year. Keeps the top `cap`. */
export function preSort(papers, cap = POOL_CAP, currentYear = new Date().getFullYear()) {
  const pre = (p) => 1 / (1 + (p.rank ?? 20)) + Math.log1p((p.citationCount ?? 0) / age(p, currentYear)) / 20;
  return [...papers].sort((a, b) => pre(b) - pre(a)).slice(0, cap);
}

/**
 * @param {Array} papers  with .embedding (unit vectors)
 * @param {object} ctx    { questionVec?, profileVec?, gaps: [{embedding, weight, claimId, humanId, type}], softExclusions: [{embedding}], seenEmbeddings: [] }
 */
export function scorePapers(papers, ctx, currentYear = new Date().getFullYear()) {
  const maxCpy = Math.max(0, ...papers.map((p) => (p.citationCount ?? 0) / age(p, currentYear)));
  const soft = ctx.softExclusions ?? [];
  const seen = ctx.seenEmbeddings ?? [];
  return papers
    .map((p) => {
      const question = ctx.questionVec ? Math.max(0, cosine(p.embedding, ctx.questionVec)) : 0;
      const profile = ctx.profileVec?.length ? Math.max(0, cosine(p.embedding, ctx.profileVec)) : 0;
      let gap = 0,
        gapTarget = null;
      for (const g of ctx.gaps ?? []) {
        const s = Math.max(0, cosine(p.embedding, g.embedding)) * g.weight;
        if (s > gap) {
          gap = s;
          gapTarget = g;
        }
      }
      const quality = qualityScore(p, maxCpy, currentYear);
      const access = p.oaPdfUrl ? 1 : 0;
      const penalty =
        Math.max(0, ...soft.map((e) => cosine(p.embedding, e.embedding) - 0.6)) +
        Math.max(0, ...seen.map((s) => cosine(p.embedding, s) - 0.92));
      const wq = ctx.questionVec ? WEIGHTS.question : 0; // no question → redistribute to profile
      const wp = ctx.questionVec ? WEIGHTS.profile : WEIGHTS.profile + WEIGHTS.question;
      const score =
        wq * question + wp * profile + WEIGHTS.gap * gap + WEIGHTS.quality * quality + WEIGHTS.access * access - penalty;
      const r = (x) => Number(x.toFixed(3));
      return {
        ...p,
        score: r(score),
        scoreBreakdown: { question: r(question), profile: r(profile), gap: r(gap), quality: r(quality), access, penalty: r(penalty) },
        gapTarget,
      };
    })
    .sort((a, b) => b.score - a.score);
}
