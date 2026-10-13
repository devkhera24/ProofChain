import { Claim } from "../../models/Claim.js";
import { EvidenceLink } from "../../models/EvidenceLink.js";
import { enqueue } from "../../jobs/runner.js";
import { embedOne } from "../ai/embeddings.js";
import { generateJson } from "../ai/llm.js";
import * as prompt from "../ai/prompts/classifyStance.js";
import { searchPassages } from "./vectorSearch.js";
import { recomputeClaimStatus } from "./claimStatus.js";
import { matchQuote } from "../validation/textMatch.js";
import { createPipelineLog } from "../validation/pipelineLog.js";
import { recordAudit } from "../audit/auditService.js";
import { emitToProject } from "../realtime/events.js";
import { nextHumanId } from "../../utils/ids.js";
import { logger } from "../../utils/logger.js";

/** `sourceIds` limits linking to some sources (used when a new source becomes ready). */
export function scheduleLinking(claimId, { sourceIds } = {}) {
  const key = sourceIds?.length ? `link:${claimId}:${sourceIds.join(",")}` : `link:${claimId}`;
  return enqueue(key, () => linkClaim(claimId, { sourceIds }));
}

/**
 * Find candidate passages for a claim, classify their stance (L5), verify the quote (L4) and store
 * `ai_suggested` links. Links a human has reviewed are never changed.
 * @returns {Promise<string[]>} pipeline log lines
 */
export async function linkClaim(claimId, { limit = 24, batchSize = 8, sourceIds } = {}) {
  const claim = await Claim.findById(claimId).select("+embedding");
  if (!claim) return [];
  const log = createPipelineLog(`link ${claim.humanId}`);
  const queryVector = claim.embedding?.length ? claim.embedding : await embedOne(claim.text, "RETRIEVAL_QUERY");
  const candidates = await searchPassages({ projectId: claim.projectId, queryVector, limit, sourceIds });

  // Skip passages a human already reviewed for this claim
  const existing = await EvidenceLink.find({ claimId: claim._id }).lean();
  const byPassage = new Map(existing.map((l) => [String(l.passageId), l]));
  const isOpen = (p) => (byPassage.get(String(p._id))?.status ?? "ai_suggested") === "ai_suggested";
  const todo = candidates.filter(isOpen);
  log.info("candidates", { retrieved: candidates.length, toClassify: todo.length });

  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize);
    const input = { claim, passages: batch.map((p) => ({ id: p.humanId, text: p.text })) };
    const out = await generateJson({
      task: "stance.classify",
      system: prompt.system,
      prompt: prompt.build(input),
      schema: prompt.schema,
      check: prompt.check(input),
      mock: () => prompt.mock(input),
    });

    for (const r of out.results) {
      const passage = batch.find((p) => p.humanId === r.passageId);
      if (!passage) continue; // guaranteed by check()
      if (r.stance === "irrelevant") {
        log.info(`skip ${passage.humanId}`, { stance: "irrelevant" });
        continue;
      }
      const m = matchQuote(r.quote, passage.text);
      if (!m.matched) {
        log.drop("L4", passage.humanId, `quote_not_found(${m.score.toFixed(2)})`);
        await recordAudit({
          projectId: claim.projectId,
          actor: "ai",
          action: "link.discarded",
          target: { kind: "claim", id: claim._id, humanId: claim.humanId },
          change: { passage: [null, passage.humanId], stance: [null, r.stance], quote: [null, r.quote] },
          reason: `Gemini quote not found in ${passage.humanId}`,
        });
        continue;
      }
      log.pass("L4", `${passage.humanId} ${r.stance} ${m.matchType}`);

      const fields = {
        projectId: claim.projectId,
        sourceId: passage.sourceId,
        stance: r.stance,
        scope: r.scope ?? undefined,
        quote: m.original,
        matchType: m.matchType,
        matchScore: m.score,
        aiRationale: r.reason,
        origin: "ai",
      };
      const prior = byPassage.get(String(passage._id));
      if (prior) {
        // Only AI suggestions are refreshed; the status filter protects a review that happened meanwhile
        await EvidenceLink.updateOne({ _id: prior._id, status: "ai_suggested" }, { $set: fields });
      } else {
        await EvidenceLink.create({
          ...fields,
          claimId: claim._id,
          passageId: passage._id,
          humanId: await nextHumanId(claim.projectId, "link"),
        }).catch((e) => {
          if (e.code !== 11000) throw e; // a link appeared meanwhile → keep it
        });
      }
    }
  }
  await recomputeClaimStatus(claim._id);
  emitToProject(claim.projectId, "claim.updated", { claimId: claim.id });
  logger.info({ claimId: claim.id, lines: log.lines }, "linking finished");
  return log.lines;
}
