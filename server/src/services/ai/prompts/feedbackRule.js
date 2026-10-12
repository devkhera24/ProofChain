import { z } from "zod";

export const system = `Turn a researcher's reason for rejecting a paper into a reusable filter rule.
Only create a rule if the reason describes a topic/approach they want to avoid. Reply with JSON only.`;

export const schema = z.object({
  rule: z.object({ concept: z.string().min(2).max(80), strength: z.enum(["soft", "hard"]) }).nullable(),
});

export const build = ({ paperTitle, reason }) => `Paper: "${paperTitle}"
Reason: "${reason}"
Return {"rule": {"concept": "short topic phrase, e.g. RDF/SPARQL", "strength": "soft"}} or {"rule": null}.
Use "hard" only if the reason says they never want this topic.`;

export const mock = ({ reason }) => ({ rule: reason?.length > 5 ? { concept: reason.slice(0, 40), strength: "soft" } : null });
