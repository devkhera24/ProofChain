import { getS2References, getS2Citations, s2Available } from "./semanticScholar.js";
import { getOpenAlexByDoi, getOpenAlexReferences, getOpenAlexCitations } from "./openAlex.js";
import { logger } from "../../utils/logger.js";

/** The id S2 understands for this paper, if any. */
const s2Ref = (ids) => ids.s2Id ?? (ids.doi ? `DOI:${ids.doi}` : ids.arxivId ? `ARXIV:${ids.arxivId}` : null);

async function openAlexIdOf(ids) {
  if (ids.openAlexId) return ids.openAlexId;
  if (ids.doi) return (await getOpenAlexByDoi(ids.doi).catch(() => null))?.ids.openAlexId ?? null;
  return null;
}

/** Semantic Scholar first; OpenAlex when S2 is unavailable (no key/rate-limited), fails, or knows nothing. */
async function withFallback(kind, ids, n, s2Fn, oaFn) {
  const ref = s2Ref(ids);
  if (ref && s2Available()) {
    try {
      const papers = await s2Fn(ref, n);
      if (papers.length) return papers;
    } catch (err) {
      logger.info({ kind, status: err.status }, "S2 snowballing failed, falling back to OpenAlex");
    }
  }
  const oaId = await openAlexIdOf(ids);
  return oaId ? oaFn(oaId, n).catch(() => []) : [];
}

/** Papers a work cites. `ids` is a paper's ids ({ doi, s2Id, openAlexId, arxivId }). */
export const getReferences = (ids, n = 20) => withFallback("references", ids, n, getS2References, getOpenAlexReferences);
/** Papers citing a work. */
export const getCitations = (ids, n = 20) => withFallback("citations", ids, n, getS2Citations, getOpenAlexCitations);
