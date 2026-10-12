import pLimit from "p-limit";
import { getJson, UpstreamError } from "./http.js";
import { env } from "../../config/env.js";
import { normDoi } from "./paper.js";
import { logger } from "../../utils/logger.js";

const BASE = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "title,abstract,year,venue,authors,externalIds,citationCount,openAccessPdf,url";
const COOLDOWN_MS = 5 * 60_000;
const limit = pLimit(1);
const headers = env.S2_API_KEY ? { "x-api-key": env.S2_API_KEY } : {};

// Without a key, S2 shares a public pool that often answers 429. After a 429 we skip S2 for a few
// minutes and rely on OpenAlex/Crossref instead of waiting through retries on every call.
let cooldownUntil = 0;
export const s2Available = () => Date.now() >= cooldownUntil;
export const __resetS2Cooldown = () => (cooldownUntil = 0);

async function call(url) {
  if (!s2Available()) throw new UpstreamError("s2", 429, "Semantic Scholar is rate-limiting us; skipped for now");
  try {
    return await limit(() => getJson("s2", url, { headers, retries: env.S2_API_KEY ? 3 : 1 }));
  } catch (err) {
    if (err.status === 429) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      logger.warn({ minutes: COOLDOWN_MS / 60_000 }, "Semantic Scholar rate limit: pausing S2 calls");
    }
    throw err;
  }
}

export function fromS2(p) {
  if (!p?.paperId || !p.title) return null;
  return {
    ids: { s2Id: p.paperId, doi: normDoi(p.externalIds?.DOI), arxivId: p.externalIds?.ArXiv },
    title: p.title,
    authors: (p.authors ?? []).map((a) => a.name),
    year: p.year ?? null,
    venue: p.venue || null,
    abstract: p.abstract ?? null,
    citationCount: p.citationCount ?? 0,
    oaPdfUrl: p.openAccessPdf?.url || null,
    url: p.url ?? null,
    providers: ["s2"],
  };
}

export async function searchS2(query, n = 20) {
  const data = await call(`${BASE}/paper/search?query=${encodeURIComponent(query)}&limit=${n}&fields=${FIELDS}`);
  return (data?.data ?? []).map(fromS2).filter(Boolean);
}
/** id can be an S2 id, "DOI:10.x/…", or "ARXIV:2101.00001" */
export async function getS2Paper(id) {
  return fromS2(await call(`${BASE}/paper/${encodeURIComponent(id)}?fields=${FIELDS}`));
}
export async function getS2References(id, n = 20) {
  const d = await call(`${BASE}/paper/${encodeURIComponent(id)}/references?limit=${n}&fields=${FIELDS}`);
  return (d?.data ?? []).map((x) => fromS2(x.citedPaper)).filter(Boolean);
}
export async function getS2Citations(id, n = 20) {
  const d = await call(`${BASE}/paper/${encodeURIComponent(id)}/citations?limit=${n}&fields=${FIELDS}`);
  return (d?.data ?? []).map((x) => fromS2(x.citingPaper)).filter(Boolean);
}
