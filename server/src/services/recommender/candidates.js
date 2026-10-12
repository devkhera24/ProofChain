import { Source } from "../../models/Source.js";
import { searchS2 } from "../scholarly/semanticScholar.js";
import { searchOpenAlex } from "../scholarly/openAlex.js";
import { getReferences, getCitations } from "../scholarly/graph.js";
import { mergePapers } from "../scholarly/merge.js";

const PER_QUERY = 20;
const SEEDS = 3;

/**
 * Search both indexes for every query, snowball from the project's newest paper sources, then dedupe.
 * Each paper gets `rank`: its best position in any result list (used for the cheap pre-sort).
 */
export async function fetchCandidates({ queries, project, log }) {
  const jobs = queries.flatMap(({ q }) => [
    ["s2", q, () => searchS2(q, PER_QUERY)],
    ["openalex", q, () => searchOpenAlex(q, PER_QUERY)],
  ]);
  const results = await Promise.allSettled(jobs.map(([, , fn]) => fn()));
  let papers = [];
  results.forEach((r, i) => {
    const [provider, q] = jobs[i];
    if (r.status === "fulfilled") r.value.forEach((p, rank) => papers.push({ ...p, rank }));
    else log.info("provider error", { provider, q: JSON.stringify(q), msg: JSON.stringify(r.reason.message) });
  });

  // Snowballing: references + citations of the newest accepted paper-sources (S2, or OpenAlex as fallback)
  const seeds = await Source.find({
    projectId: project._id,
    kind: "paper",
    $or: [{ "ids.doi": { $exists: true } }, { "ids.s2Id": { $exists: true } }, { "ids.openAlexId": { $exists: true } }],
  })
    .sort({ createdAt: -1 })
    .limit(SEEDS)
    .lean();
  for (const s of seeds) {
    const [refs, cites] = await Promise.allSettled([getReferences(s.ids, PER_QUERY), getCitations(s.ids, PER_QUERY)]);
    for (const r of [refs, cites]) (r.value ?? []).forEach((p, rank) => papers.push({ ...p, rank: rank + PER_QUERY / 2 }));
  }
  log.info("fetched", { raw: papers.length, seeds: seeds.length });

  papers = mergePapers(papers);
  log.info("after_dedupe", { count: papers.length });
  return papers;
}
