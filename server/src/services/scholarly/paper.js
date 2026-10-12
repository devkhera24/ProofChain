/**
 * @typedef {Object} Paper
 * @property {{doi?:string,s2Id?:string,openAlexId?:string,arxivId?:string}} ids
 * @property {string} title @property {string[]} authors @property {number|null} year
 * @property {string|null} venue @property {string|null} abstract @property {number} citationCount
 * @property {string|null} oaPdfUrl @property {string|null} url @property {string[]} providers
 */
export const normDoi = (d) =>
  d
    ?.toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:/, "")
    .trim() || undefined;

export function paperKey(p) {
  if (p.ids.doi) return `doi:${p.ids.doi}`;
  if (p.ids.arxivId) return `arxiv:${p.ids.arxivId}`;
  if (p.ids.s2Id) return `s2:${p.ids.s2Id}`;
  return `oa:${p.ids.openAlexId}`;
}

/** Strip JATS/HTML tags that Crossref puts in abstracts. */
export const stripTags = (s) => s?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
