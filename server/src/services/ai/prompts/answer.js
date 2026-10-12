import { z } from "zod";
import { idsCheck } from "./util.js";

export const system = `You are a careful research assistant. Answer ONLY from the passages provided.
Every factual sentence must cite a passage like [P-14] and you must list each citation with an exact quote.
If the passages disagree, say so and explain under what conditions each side holds.
If the passages don't answer the question, say what is missing. Never use outside knowledge. Reply with JSON only.`;

export const schema = z.object({
  answer: z.string().min(1).max(2500), // markdown-free prose with [P-x] markers
  citations: z.array(z.object({ passageId: z.string(), quote: z.string().min(8).max(400) })).max(12),
  evidenceSufficient: z.boolean(),
});

export const build = ({ question, passages }) => `QUESTION: ${question}

PASSAGES:
${passages
  .map((p) => `[${p.id}] (source: ${p.source?.title ?? "unknown"}; type: ${p.source?.sourceType ?? "unknown"})\n${p.text.slice(0, 1200)}`)
  .join("\n\n")}

Return {"answer": prose with [P-x] markers, "citations": [{"passageId": "P-x", "quote": exact words from that passage}], "evidenceSufficient": boolean}.`;

export const check = ({ passages }) =>
  idsCheck(
    new Set(passages.map((p) => p.id)),
    (d) => d.citations.map((c) => c.passageId),
  );

const firstSentence = (t) => t.split(/(?<=\.)\s/)[0].slice(0, 200);

/** Mock: cites the first two passages with their first sentences. */
export const mock = ({ passages }) => {
  const used = passages.slice(0, 2);
  return {
    answer: used.length
      ? used.map((p) => `${firstSentence(p.text)} [${p.id}]`).join(" ")
      : "Your sources don't cover this yet.",
    citations: used.map((p) => ({ passageId: p.id, quote: firstSentence(p.text) })),
    evidenceSufficient: used.length > 0,
  };
};
