import { normTitle } from "../validation/metadata.js";

/** Every identity a record can be matched on: DOI, arXiv id, and title + first author's last name. */
function keysOf(p) {
  const keys = [];
  if (p.ids.doi) keys.push(`doi:${p.ids.doi}`);
  if (p.ids.arxivId) keys.push(`arxiv:${p.ids.arxivId}`);
  const title = normTitle(p.title);
  if (title) keys.push(`t:${title}|${normTitle(p.authors?.[0] ?? "").split(" ").pop()}`);
  return keys;
}

/**
 * Merge records describing the same paper; prefers non-empty fields; unions ids & providers.
 * Two records match if they share ANY identity (e.g. an S2 record without a DOI and an OpenAlex record with one,
 * same title and first author).
 */
export function mergePapers(papers) {
  const merged = [];
  const index = new Map(); // key → merged record
  for (const p of papers) {
    const keys = keysOf(p);
    const prev = keys.map((k) => index.get(k)).find(Boolean);
    if (!prev) {
      const rec = { ...p, ids: { ...p.ids }, authors: [...(p.authors ?? [])], providers: [...p.providers] };
      merged.push(rec);
      keys.forEach((k) => index.set(k, rec));
      continue;
    }
    prev.ids = { ...p.ids, ...Object.fromEntries(Object.entries(prev.ids).filter(([, v]) => v)) };
    for (const f of ["venue", "year", "oaPdfUrl", "url"]) prev[f] ||= p[f];
    if (!prev.authors.length && p.authors?.length) prev.authors = [...p.authors];
    if ((p.abstract?.length ?? 0) > (prev.abstract?.length ?? 0)) prev.abstract = p.abstract;
    prev.citationCount = Math.max(prev.citationCount ?? 0, p.citationCount ?? 0);
    prev.providers = [...new Set([...prev.providers, ...p.providers])];
    keysOf(prev).forEach((k) => index.set(k, prev)); // the merged record may have gained a DOI
  }
  return merged;
}
