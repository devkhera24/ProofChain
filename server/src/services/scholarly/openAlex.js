import pLimit from "p-limit";
import { getJson } from "./http.js";
import { env } from "../../config/env.js";
import { normDoi } from "./paper.js";

const BASE = "https://api.openalex.org";
const limit = pLimit(2);
const mail = `mailto=${encodeURIComponent(env.CONTACT_EMAIL)}`;
const call = (url) => limit(() => getJson("openalex", url));

export function abstractFromInverted(inv) {
  if (!inv) return null;
  const words = [];
  for (const [word, positions] of Object.entries(inv)) for (const i of positions) words[i] = word;
  return words.filter(Boolean).join(" ") || null;
}

export function fromOpenAlex(w) {
  if (!w?.id || !w.display_name) return null;
  const arxiv = w.ids?.arxiv?.match(/arxiv\.org\/abs\/([^v\s]+)/i)?.[1];
  return {
    ids: { openAlexId: w.id.replace("https://openalex.org/", ""), doi: normDoi(w.doi), ...(arxiv && { arxivId: arxiv }) },
    title: w.display_name,
    authors: (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean),
    year: w.publication_year ?? null,
    venue: w.primary_location?.source?.display_name ?? null,
    abstract: abstractFromInverted(w.abstract_inverted_index),
    citationCount: w.cited_by_count ?? 0,
    oaPdfUrl: w.best_oa_location?.pdf_url ?? w.open_access?.oa_url ?? null,
    url: w.doi ?? w.id,
    providers: ["openalex"],
  };
}

export async function searchOpenAlex(query, n = 20) {
  const d = await call(`${BASE}/works?search=${encodeURIComponent(query)}&per-page=${n}&${mail}`);
  return (d?.results ?? []).map(fromOpenAlex).filter(Boolean);
}
export async function getOpenAlexByDoi(doi) {
  return fromOpenAlex(await call(`${BASE}/works/doi:${encodeURIComponent(doi)}?${mail}`));
}
export async function getOpenAlexWork(id) {
  return fromOpenAlex(await call(`${BASE}/works/${encodeURIComponent(id)}?${mail}`));
}

/** Papers this work cites (its `referenced_works`), fetched in one filtered request. */
export async function getOpenAlexReferences(openAlexId, n = 20) {
  const work = await call(`${BASE}/works/${encodeURIComponent(openAlexId)}?select=referenced_works&${mail}`);
  const ids = (work?.referenced_works ?? []).slice(0, n).map((u) => u.replace("https://openalex.org/", ""));
  if (!ids.length) return [];
  const d = await call(`${BASE}/works?filter=openalex:${ids.join("|")}&per-page=${ids.length}&${mail}`);
  return (d?.results ?? []).map(fromOpenAlex).filter(Boolean);
}
/** Papers that cite this work, most cited first. */
export async function getOpenAlexCitations(openAlexId, n = 20) {
  const d = await call(`${BASE}/works?filter=cites:${encodeURIComponent(openAlexId)}&sort=cited_by_count:desc&per-page=${n}&${mail}`);
  return (d?.results ?? []).map(fromOpenAlex).filter(Boolean);
}
