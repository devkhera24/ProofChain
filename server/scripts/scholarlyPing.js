// Live check of the scholarly APIs: npm run scholarly:ping (no keys needed; S2_API_KEY optional)
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { searchS2 } from "../src/services/scholarly/semanticScholar.js";
import { searchOpenAlex } from "../src/services/scholarly/openAlex.js";
import { mergePapers } from "../src/services/scholarly/merge.js";
import { verifyPaper } from "../src/services/scholarly/verify.js";
import { getReferences, getCitations } from "../src/services/scholarly/graph.js";
import { createPipelineLog } from "../src/services/validation/pipelineLog.js";

await mongoose.connect(env.MONGODB_URI); // responses are cached in PaperCache
const query = process.argv[2] ?? "graph database benchmark";
const log = createPipelineLog("ping");
const [s2, oa] = await Promise.allSettled([searchS2(query, 5), searchOpenAlex(query, 5)]);
for (const [name, r] of [["Semantic Scholar", s2], ["OpenAlex", oa]]) {
  if (r.status === "rejected") console.log(`✖ ${name}: ${r.reason.message}`);
  else console.log(`✔ ${name}: ${r.value.length} results\n${r.value.map((p) => `   - ${p.title} (${p.year ?? "n.d."})`).join("\n")}`);
}
const merged = mergePapers([...(s2.value ?? []), ...(oa.value ?? [])]);
console.log(`✔ merged: ${merged.length} unique papers`);
const first = merged.find((p) => p.ids.doi) ?? merged[0];
if (first) {
  const v = await verifyPaper(first, log);
  console.log(`✔ verify "${first.title.slice(0, 50)}": ${JSON.stringify(v)}`);
  const [refs, cites] = await Promise.all([getReferences(first.ids, 5), getCitations(first.ids, 5)]);
  console.log(`✔ references: ${refs.length}, citations: ${cites.length}`);
}
console.log(log.lines.join("\n"));
await mongoose.disconnect();
