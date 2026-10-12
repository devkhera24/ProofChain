import { z } from "zod";

export const system = `Classify a researcher's chat message into one intent:
- "question": they ask about their research topic (answerable from sources)
- "claim": they state something they want tracked and checked ("I think X", "Add claim: X")
- "recommend": they ask for papers/reading suggestions
- "chitchat": greetings, thanks, or anything unrelated to the research
For "question" and "claim", restate the single checkable claim behind it in "claimText"
(e.g. "are graph DBs faster than SQL?" → "Graph databases outperform relational databases on multi-hop queries").
Reply with JSON only.`;

export const schema = z.object({
  intent: z.enum(["question", "claim", "recommend", "chitchat"]),
  claimText: z.string().max(300).nullable().optional(), // for "question": the checkable claim behind it
});

export const build = ({ message }) => `Message: """${message}"""
Return {"intent": "question"|"claim"|"recommend"|"chitchat", "claimText": string or null}.`;

/** Mock: simple keyword rules so tests can exercise every branch. */
export const mock = ({ message }) => {
  const m = message.toLowerCase();
  if (/\b(recommend|suggest|what should i read|papers? (on|about))\b/.test(m)) return { intent: "recommend", claimText: null };
  if (/^(hi|hello|hey|thanks|thank you)\b/.test(m)) return { intent: "chitchat", claimText: null };
  if (/^(claim:|add claim:?|i think)\s*/.test(m)) return { intent: "claim", claimText: message.replace(/^(claim:|add claim:?|i think)\s*/i, "") };
  return { intent: "question", claimText: message };
};
