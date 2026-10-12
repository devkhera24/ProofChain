// Live check of the Gemini setup: AI_MOCK=false npm run ai:ping (needs GEMINI_API_KEY in server/.env)
import { z } from "zod";
import { env } from "../src/config/env.js";
import { generateJson } from "../src/services/ai/gemini.js";
import { embedOne } from "../src/services/ai/embeddings.js";

if (env.AI_MOCK) {
  console.error("AI_MOCK is true — run with AI_MOCK=false to call the real API.");
  process.exit(1);
}

try {
  const reply = await generateJson({
    task: "ping",
    system: "You are a connectivity check. Reply with JSON only.",
    prompt: 'Reply with {"ok": true, "sum": <the sum of 2 and 3>}.',
    schema: z.object({ ok: z.literal(true), sum: z.number() }),
    check: (d) => (d.sum === 5 ? null : "sum must be 5"),
  });
  console.log(`✔ ${env.GEMINI_MODEL}: ${JSON.stringify(reply)}`);

  const vector = await embedOne("graph databases", "RETRIEVAL_QUERY");
  const length = Math.sqrt(vector.reduce((s, x) => s + x * x, 0));
  console.log(`✔ ${env.GEMINI_EMBED_MODEL}: ${vector.length} dims (expected ${env.EMBED_DIM}), norm ${length.toFixed(3)}`);
  if (vector.length !== env.EMBED_DIM) process.exitCode = 1;
} catch (err) {
  console.error(`✖ ${err.message}${err.details ? ` — ${JSON.stringify(err.details)}` : ""}`);
  process.exitCode = 1;
}
