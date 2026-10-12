import { z } from "zod";
import { formatItems, idsCheck } from "./util.js";

export const system = `You extract atomic, checkable research claims from passages.
A good claim is one specific statement that evidence can support or contradict
(e.g. "Graph databases outperform relational databases on multi-hop traversal queries").
Avoid vague claims ("graph databases are better"). Split compound statements.
Use ONLY the passages provided. Every claim must cite at least one passage ID and include
an exact quote copied from that passage. Reply with JSON only.`;

export const schema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().min(15).max(300),
        passageId: z.string(),
        quote: z.string().min(8).max(400),
      }),
    )
    .max(12),
});

export const build = ({ passages, existingClaims, topics }) => `Research topics: ${topics.join(", ") || "not specified"}

Existing claims (do not repeat these):
${existingClaims.map((c) => `- ${c.text}`).join("\n") || "- none"}

Passages:
${formatItems(passages)}

Return {"claims":[{"text": string, "passageId": one of the IDs above, "quote": exact words from that passage}]}.
Return at most 8 claims, the most central and checkable ones.`;

export const check = ({ passages }) =>
  idsCheck(
    new Set(passages.map((p) => p.id)),
    (d) => d.claims.map((c) => c.passageId),
  );

export const mock = ({ passages }) => ({
  claims: passages.slice(0, 2).map((p) => ({
    text: `Mock claim derived from ${p.id}: ${p.text.slice(0, 60)}`,
    passageId: p.id,
    quote: p.text.split(/(?<=\.)\s/)[0].slice(0, 120),
  })),
});
