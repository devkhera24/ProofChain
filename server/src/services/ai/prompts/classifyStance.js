import { z } from "zod";
import { formatItems, idsCheck } from "./util.js";

export const system = `You assess whether passages support a research claim. Use only the passages given.
For each passage decide: "supports", "contradicts", "inconclusive" (related but doesn't settle it), or "irrelevant".
Copy an exact quote (max 40 words) from the passage that justifies your label.
If the passage only supports the claim under specific conditions (a workload, dataset, version, scale),
put those conditions in "scope". If unsure, use "inconclusive". Never invent text. Reply with JSON only.`;

export const schema = z.object({
  results: z.array(
    z.object({
      passageId: z.string(),
      stance: z.enum(["supports", "contradicts", "inconclusive", "irrelevant"]),
      quote: z.string().max(400).optional().default(""),
      scope: z.string().max(200).nullable().optional(),
      reason: z.string().max(300),
    }),
  ),
});

export const build = ({ claim, passages }) => `CLAIM [${claim.humanId}]: ${claim.text}

PASSAGES:
${formatItems(passages)}

Return {"results":[{"passageId","stance","quote","scope","reason"}]} with one entry per passage.`;

export const check = ({ passages }) =>
  idsCheck(
    new Set(passages.map((p) => p.id)),
    (d) => d.results.map((r) => r.passageId),
  );

export const mock = ({ passages }) => ({
  results: passages.map((p, i) => ({
    passageId: p.id,
    stance: ["supports", "contradicts", "inconclusive", "irrelevant"][i % 4],
    quote: p.text.slice(0, 80),
    scope: null,
    reason: "mock",
  })),
});
