import pLimit from "p-limit";
import { getJson } from "./http.js";
import { env } from "../../config/env.js";
import { normDoi, stripTags } from "./paper.js";

const limit = pLimit(2);
// Crossref's "polite pool": identify ourselves with a contact address
const headers = { "User-Agent": `ProofChain/1.0 (mailto:${env.CONTACT_EMAIL})` };

export function fromCrossref(m) {
  const title = m?.title?.[0];
  if (!title) return null;
  const year = (m.issued ?? m["published-print"] ?? m["published-online"])?.["date-parts"]?.[0]?.[0] ?? null;
  return {
    ids: { doi: normDoi(m.DOI) },
    title: stripTags(title),
    authors: (m.author ?? []).map((a) => [a.given, a.family].filter(Boolean).join(" ") || a.name).filter(Boolean),
    year,
    venue: m["container-title"]?.[0] ?? null,
    abstract: stripTags(m.abstract),
    citationCount: m["is-referenced-by-count"] ?? 0,
    oaPdfUrl: null,
    url: m.URL ?? (m.DOI ? `https://doi.org/${m.DOI}` : null),
    providers: ["crossref"],
  };
}

export async function getCrossref(doi) {
  const d = await limit(() => getJson("crossref", `https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers }));
  return d ? fromCrossref(d.message) : null;
}
