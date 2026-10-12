import { z } from "zod";
import { idsCheck } from "./util.js";

export const system = `You write short academic search queries (2-6 words each) for paper search engines.
Do not invent paper titles or author names. Reply with JSON only.`;

export const schema = z.object({
  queries: z
    .array(
      z.object({
        q: z.string().min(3).max(80),
        purpose: z.enum(["core", "gap"]),
        gapClaimId: z.string().nullable().optional(),
      }),
    )
    .min(3)
    .max(6),
});

export const build = ({ question, topics, gaps, exclusions }) => `Researcher topics: ${topics.join(", ")}
Current question: ${question ?? "(none — first recommendations)"}
Open evidence gaps:
${gaps.map((g) => `- [${g.claimHumanId}] ${g.type}: ${g.queryHint}`).join("\n") || "- none"}
Avoid these topics: ${exclusions.map((e) => e.concept).join(", ") || "none"}

Return {"queries":[{"q": string, "purpose": "core"|"gap", "gapClaimId": claim ID or null}]}.
Write 2 core queries about the question/topics and up to 3 gap queries targeting the gaps.`;

export const check = ({ gaps }) =>
  idsCheck(
    new Set(gaps.map((g) => g.claimHumanId)),
    (d) => d.queries.map((x) => x.gapClaimId).filter(Boolean),
  );

export const mock = ({ topics, gaps }) => {
  const t = topics[0] ?? "graph databases";
  const queries = [
    { q: t, purpose: "core", gapClaimId: null },
    { q: `${t} survey`, purpose: "core", gapClaimId: null },
    ...gaps.slice(0, 3).map((g) => ({ q: g.queryHint.split(" ").slice(0, 5).join(" "), purpose: "gap", gapClaimId: g.claimHumanId })),
  ];
  if (queries.length < 3) queries.push({ q: `${t} evaluation`, purpose: "core", gapClaimId: null });
  return { queries };
};
