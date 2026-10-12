import { getS2Paper, s2Available } from "./semanticScholar.js";
import { getOpenAlexByDoi, getOpenAlexWork } from "./openAlex.js";
import { getCrossref } from "./crossref.js";
import { metadataConsistent } from "../validation/metadata.js";

/**
 * L1 + L2: a candidate came from one index. Verification means resolving it independently in a second
 * source and checking the metadata agrees.
 * @returns {{ verified: boolean, verifiedIds: string[], reason?: string }}
 */
export async function verifyPaper(paper, log) {
  const label = `"${paper.title.slice(0, 60)}" (${paper.year ?? "n.d."})`;
  const checks = [];
  if (paper.ids.doi) {
    checks.push(["doi", () => getCrossref(paper.ids.doi)]);
    if (!paper.providers.includes("openalex")) checks.push(["openalex", () => getOpenAlexByDoi(paper.ids.doi)]);
  } else if (paper.ids.openAlexId && !paper.providers.includes("openalex")) {
    checks.push(["openalex", () => getOpenAlexWork(paper.ids.openAlexId)]);
  }
  if (!paper.providers.includes("s2")) {
    const s2Ref = paper.ids.doi ? `DOI:${paper.ids.doi}` : paper.ids.arxivId ? `ARXIV:${paper.ids.arxivId}` : null;
    if (s2Ref && s2Available()) checks.push(["s2", () => getS2Paper(s2Ref)]);
  } else if (paper.ids.s2Id && s2Available()) {
    checks.push(["s2", () => getS2Paper(paper.ids.s2Id)]);
  }
  if (!checks.length) {
    log?.drop("L1", label, "no_resolvable_id");
    return { verified: false, verifiedIds: [], reason: "no_resolvable_id" };
  }

  const verifiedIds = [];
  for (const [name, fetcher] of checks) {
    const record = await fetcher().catch(() => null);
    if (!record) continue;
    const c = metadataConsistent(paper, record);
    if (!c.ok) {
      log?.drop("L2", label, c.reasons.join(","));
      return { verified: false, verifiedIds, reason: c.reasons.join(",") };
    }
    verifiedIds.push(name);
  }
  if (!verifiedIds.length) {
    log?.drop("L1", label, "no_id_resolves");
    return { verified: false, verifiedIds, reason: "no_id_resolves" };
  }
  log?.pass("L1/L2", `${label} via ${verifiedIds.join("+")}`);
  return { verified: true, verifiedIds };
}
