import { Claim } from "../../models/Claim.js";
import { Passage } from "../../models/Passage.js";
import { Project } from "../../models/Project.js";
import { EvidenceLink } from "../../models/EvidenceLink.js";
import { embedOne } from "../ai/embeddings.js";
import { generateJson } from "../ai/gemini.js";
import * as extractPrompt from "../ai/prompts/extractClaims.js";
import { matchQuote } from "../validation/textMatch.js";
import { createPipelineLog } from "../validation/pipelineLog.js";
import { recordAudit } from "../audit/auditService.js";
import { scheduleLinking } from "../evidence/linker.js";
import { recomputeClaimStatus } from "../evidence/claimStatus.js";
import { emitToProject } from "../realtime/events.js";
import { nextHumanId } from "../../utils/ids.js";
import { cosine } from "../../utils/vectors.js";
import { logger } from "../../utils/logger.js";

const DUPLICATE_THRESHOLD = 0.9;
const MAX_PASSAGES = 30;

/** Create a claim, or return the existing near-duplicate. */
export async function createOrMergeClaim({ projectId, text, scopeNote, origin, userId, actorName, embedding }) {
  embedding ??= await embedOne(text, "SEMANTIC_SIMILARITY");
  const existing = await Claim.find({ projectId }).select("+embedding");
  const dup = existing.find((c) => c.embedding?.length && cosine(c.embedding, embedding) >= DUPLICATE_THRESHOLD);
  if (dup) return { claim: dup, merged: true };
  const humanId = await nextHumanId(projectId, "claim");
  const claim = await Claim.create({ projectId, humanId, text, scopeNote, origin, createdBy: userId, embedding });
  await recordAudit({
    projectId,
    actor: userId ?? "ai",
    actorName,
    action: "claim.created",
    target: { kind: "claim", id: claim._id, humanId },
    change: { text: [null, text] },
  });
  return { claim, merged: false };
}

/** Every k-th passage so the sample covers the whole source (cost control). */
export function spreadSample(items, max) {
  if (items.length <= max) return items;
  const step = items.length / max;
  return Array.from({ length: max }, (_, i) => items[Math.floor(i * step)]);
}

/**
 * Ask Gemini for claims grounded in a source's passages. Each claim must quote a passage it was shown
 * (L4); claims whose quote can't be found are dropped and audited.
 * @returns {{ created: Claim[], merged: Claim[], dropped: number, log: string[] }}
 */
export async function extractClaimsFromSource(sourceId) {
  const all = await Passage.find({ sourceId }).sort({ charStart: 1 }).lean();
  const log = createPipelineLog(`claims source=${sourceId}`);
  const result = { created: [], merged: [], dropped: 0, log: log.lines };
  if (!all.length) return result;

  const { projectId } = all[0];
  const project = await Project.findById(projectId).select("topics").lean();
  if (!project) return result;
  const passages = spreadSample(all, MAX_PASSAGES);
  const byHumanId = new Map(passages.map((p) => [p.humanId, p]));
  const input = {
    passages: passages.map((p) => ({ id: p.humanId, text: p.text })),
    existingClaims: await Claim.find({ projectId }).select("text").lean(),
    topics: project.topics ?? [],
  };
  log.info("start", { passages: passages.length, of: all.length });

  const { claims } = await generateJson({
    task: "claims.extract",
    system: extractPrompt.system,
    prompt: extractPrompt.build(input),
    schema: extractPrompt.schema,
    mock: () => extractPrompt.mock(input),
    check: extractPrompt.check(input),
  });

  for (const c of claims) {
    const passage = byHumanId.get(c.passageId); // guaranteed by the idsCheck above; belt and braces:
    if (!passage) {
      result.dropped++;
      log.drop("L5", `"${c.text.slice(0, 60)}"`, `unknown_passage(${c.passageId})`);
      continue;
    }
    const m = matchQuote(c.quote, passage.text);
    if (!m.matched) {
      result.dropped++;
      log.drop("L4", `"${c.text.slice(0, 60)}" via ${c.passageId}`, `quote_not_found(${m.score})`);
      await recordAudit({
        projectId,
        actor: "ai",
        action: "ai.quote_not_found",
        target: { kind: "passage", id: passage._id, humanId: passage.humanId },
        change: { claim: [null, c.text], quote: [null, c.quote] },
        reason: `Best similarity ${m.score}`,
      });
      continue;
    }

    const { claim, merged } = await createOrMergeClaim({ projectId, text: c.text, origin: "ai_from_source" });
    (merged ? result.merged : result.created).push(claim);
    log.pass("L4", `${claim.humanId} via ${passage.humanId} ${m.matchType}${merged ? " (merged)" : ""}`);

    // First evidence link: the passage the claim came from. The quote is the passage's real text.
    const exists = await EvidenceLink.exists({ claimId: claim._id, passageId: passage._id });
    if (!exists) {
      await EvidenceLink.create({
        projectId,
        humanId: await nextHumanId(projectId, "link"),
        claimId: claim._id,
        passageId: passage._id,
        sourceId: passage.sourceId,
        stance: "supports",
        status: "ai_suggested",
        origin: "ai",
        quote: m.original,
        matchType: m.matchType,
        matchScore: m.score,
        aiRationale: "Claim extracted from this passage",
      });
    }
  }

  log.info("done", { created: result.created.length, merged: result.merged.length, dropped: result.dropped });
  logger.info({ sourceId, lines: log.lines }, "claim extraction finished");
  if (result.created.length || result.merged.length) emitToProject(projectId, "claims.updated", { sourceId: String(sourceId) });
  for (const claim of [...result.created, ...result.merged]) await recomputeClaimStatus(claim._id);
  for (const claim of result.created) scheduleLinking(claim._id);
  return result;
}
