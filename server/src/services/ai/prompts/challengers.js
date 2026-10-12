import { z } from "zod";
import { idsCheck } from "./util.js";

export const system = `You check whether paper abstracts contradict or qualify a researcher's claims.
Use ONLY the abstracts and claims given. "contradicts" = the abstract reports the opposite result.
"qualifies" = it limits the claim (only under some conditions, smaller effect, trade-offs).
For every non-"none" result copy one exact sentence from that abstract as evidence.
Use only the paper IDs (X1…) and claim IDs (C…) given. Reply with JSON only.`;

export const schema = z.object({
  results: z
    .array(
      z.object({
        paperId: z.string(),
        claimId: z.string(),
        relation: z.enum(["contradicts", "qualifies", "none"]),
        abstractQuote: z.string().max(600).optional().default(""),
      }),
    )
    .max(40),
});

export const build = ({ papers, claims }) => `CLAIMS:
${claims.map((c) => `[${c.id}] ${c.text}`).join("\n")}

PAPERS:
${papers.map((p) => `[${p.id}] ${p.title}\nAbstract: ${p.abstract.slice(0, 1500)}`).join("\n\n")}

Return {"results":[{"paperId","claimId","relation","abstractQuote"}]} only for pairs where the relation is not "none".`;

export const check = ({ papers, claims }) => {
  const paperIds = idsCheck(new Set(papers.map((p) => p.id)), (d) => d.results.map((r) => r.paperId));
  const claimIds = idsCheck(new Set(claims.map((c) => c.id)), (d) => d.results.map((r) => r.claimId));
  return (d) => paperIds(d) ?? claimIds(d);
};

/** Mock: the first paper qualifies the first claim, quoting its first abstract sentence. */
export const mock = ({ papers, claims }) => ({
  results:
    papers.length && claims.length
      ? [{ paperId: papers[0].id, claimId: claims[0].id, relation: "qualifies", abstractQuote: papers[0].abstract.split(/(?<=\.)\s/)[0] }]
      : [],
});
