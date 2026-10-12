import { z } from "zod";

export const system = `Explain in one sentence why a paper is useful to this researcher, using ONLY its abstract.
Also copy one exact sentence from the abstract that justifies your explanation. Reply with JSON only.`;

export const schema = z.object({
  rationale: z.string().min(10).max(220),
  abstractQuote: z.string().min(15).max(500),
});

export const build = ({ slot, topics, gapText, paper }) => `Researcher topics: ${topics.join(", ")}
Slot: ${slot}${gapText ? `\nTargets this evidence gap: ${gapText}` : ""}
Paper title: ${paper.title}
Abstract: ${paper.abstract}
Return {"rationale": string (<= 25 words), "abstractQuote": one exact sentence from the abstract}.`;

export const mock = ({ paper }) => ({
  rationale: `Relevant to your topics (${paper.title.slice(0, 40)}).`,
  abstractQuote: paper.abstract.split(/(?<=\.)\s/)[0],
});
