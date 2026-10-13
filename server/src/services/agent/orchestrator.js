import { ChatMessage } from "../../models/ChatMessage.js";
import { Source } from "../../models/Source.js";
import { RecommendationBatch } from "../../models/RecommendationBatch.js";
import { generateJson, generateText } from "../ai/llm.js";
import { embedOne } from "../ai/embeddings.js";
import * as intentPrompt from "../ai/prompts/intent.js";
import * as answerPrompt from "../ai/prompts/answer.js";
import * as smallTalkPrompt from "../ai/prompts/smallTalk.js";
import { createOrMergeClaim } from "../claims/claimService.js";
import { scheduleLinking } from "../evidence/linker.js";
import { searchPassages } from "../evidence/vectorSearch.js";
import { recordQuestion } from "../profile/profileService.js";
import { createBatch, scheduleRecommendation } from "../recommender/pipeline.js";
import { matchQuote } from "../validation/textMatch.js";
import { emitToProject } from "../realtime/events.js";

const QUESTION_CLAIM_THRESHOLD = 0.85; // a question maps to an existing claim at this similarity
const ANSWER_PASSAGES = 12;
const RECOMMEND_EVERY = 2; // questions

async function classifyIntent(message) {
  const input = { message };
  return generateJson({
    task: "chat.intent",
    system: intentPrompt.system,
    prompt: intentPrompt.build(input),
    schema: intentPrompt.schema,
    mock: () => intentPrompt.mock(input),
  });
}

const smallTalk = (message, project) => {
  const input = { message, topics: project.topics ?? [] };
  return generateText({ task: "chat.smallTalk", system: smallTalkPrompt.system, prompt: smallTalkPrompt.build(input), mock: () => smallTalkPrompt.mock(input) });
};

/** Saves the agent message (with citations and meta), emits chat.message, returns it. */
async function reply(project, content, meta = {}, citations = []) {
  const message = await ChatMessage.create({ projectId: project._id, role: "agent", content, citations, meta });
  emitToProject(project._id, "chat.message", { messageId: message.id });
  return message;
}

/** Start a batch unless one is already running for this user. @returns the batch or null */
async function enqueueRecommendation({ project, user, trigger, triggerText }) {
  const running = await RecommendationBatch.exists({ projectId: project._id, userId: user._id, status: "running" });
  if (running) return null;
  const batch = await createBatch({ projectId: project._id, userId: user._id, trigger, triggerText });
  scheduleRecommendation({ projectId: project._id, userId: user._id, trigger, triggerText, batchId: batch._id });
  return batch;
}

/** Recommend after every 2nd question (counted from this user's chat history in the project). */
async function shouldTriggerRecommendation(projectId, userId) {
  const questions = await ChatMessage.countDocuments({ projectId, userId, role: "user", "meta.intent": "question" });
  return questions % RECOMMEND_EVERY === 0;
}

/** Remove markers whose citation failed L4, and tidy the spaces they leave behind. */
export function stripInvalidMarkers(answer, validIds) {
  return answer
    .replace(/\s*\[(P-\d+)\]/g, (m, id) => (validIds.has(id) ? m : ""))
    .replace(/ +([.,;:!?])/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}

/**
 * One chat turn. Routes by intent; questions get answers grounded in the project's passages with every
 * citation validated (L4).
 * @returns {{ userMessage, agentMessage }}
 */
export async function handleTurn({ project, user, message }) {
  const userMessage = await ChatMessage.create({ projectId: project._id, userId: user._id, role: "user", content: message });
  const { intent, claimText } = await classifyIntent(message);
  userMessage.meta = { intent };
  await userMessage.save();
  const done = (agentMessage) => ({ userMessage, agentMessage });

  if (intent === "recommend") {
    const batch = await enqueueRecommendation({ project, user, trigger: "manual", triggerText: message });
    return done(
      await reply(
        project,
        batch
          ? "I'm searching for five verified papers now — they'll appear on the right."
          : "A batch of recommendations is already being prepared — it'll appear on the right.",
        { intent, batchId: batch?.id ?? null },
      ),
    );
  }

  if (intent === "claim") {
    const { claim, merged } = await createOrMergeClaim({
      projectId: project._id,
      text: claimText || message,
      origin: "user",
      userId: user.id,
      actorName: user.name,
    });
    scheduleLinking(claim._id);
    return done(
      await reply(
        project,
        merged
          ? `That matches existing claim ${claim.humanId}. I'm re-checking its evidence.`
          : `Added claim ${claim.humanId}. I'm looking for supporting and contradicting passages.`,
        { intent, claimId: claim.id, claimHumanId: claim.humanId },
      ),
    );
  }

  if (intent === "chitchat") return done(await reply(project, await smallTalk(message, project), { intent }));

  // ---- question ----
  const qVec = await embedOne(message, "RETRIEVAL_QUERY");
  await recordQuestion(project._id, user._id, message, await embedOne(message, "SEMANTIC_SIMILARITY")); // schedules profile drift

  const claimVec = claimText ? await embedOne(claimText, "SEMANTIC_SIMILARITY") : undefined;
  const { claim, merged } = await createOrMergeClaim({
    projectId: project._id,
    text: claimText || message,
    origin: "ai_from_question",
    userId: user.id,
    actorName: user.name,
    embedding: claimVec,
    threshold: QUESTION_CLAIM_THRESHOLD,
  });
  scheduleLinking(claim._id);

  const passages = await searchPassages({ projectId: project._id, queryVector: qVec, limit: ANSWER_PASSAGES });
  const footer =
    `${merged ? `Mapped to existing claim ${claim.humanId}` : `Tracking this as claim ${claim.humanId}`}. ` +
    "Evidence links are provisional until you review them.";
  const recommended = (await shouldTriggerRecommendation(project._id, user._id))
    ? Boolean(await enqueueRecommendation({ project, user, trigger: "question", triggerText: message }))
    : false;
  const baseMeta = { intent, claimId: claim.id, claimHumanId: claim.humanId, recommended };

  if (!passages.length) {
    return done(
      await reply(project, `Your project has no processed sources yet, so I can't answer from evidence. Add a web page or PDF in Sources. ${footer}`, {
        ...baseMeta,
        validation: { proposed: 0, dropped: 0 },
      }),
    );
  }

  const sources = await Source.find({ _id: { $in: passages.map((p) => p.sourceId) } }).select("title sourceType").lean();
  const input = {
    question: message,
    passages: passages.map((p) => ({ id: p.humanId, text: p.text, source: sources.find((s) => s._id.equals(p.sourceId)) })),
  };
  const out = await generateJson({
    task: "chat.answer",
    system: answerPrompt.system,
    prompt: answerPrompt.build(input),
    schema: answerPrompt.schema,
    check: answerPrompt.check(input),
    mock: () => answerPrompt.mock(input),
  });

  // Validate citations (L4). Invalid ones are removed from the answer text too.
  const valid = [];
  for (const c of out.citations) {
    const p = passages.find((x) => x.humanId === c.passageId);
    const m = p && matchQuote(c.quote, p.text);
    if (m?.matched) valid.push({ passageId: p._id, humanId: p.humanId, sourceId: p.sourceId, quote: m.original, matchType: m.matchType });
  }
  const validIds = new Set(valid.map((v) => v.humanId));
  const answer = stripInvalidMarkers(out.answer, validIds);
  const validation = { proposed: out.citations.length, dropped: out.citations.length - valid.length, evidenceSufficient: out.evidenceSufficient };

  const content = valid.length
    ? `${answer}\n\n${footer}`
    : `I couldn't find passages in your sources that answer this reliably. ${footer}`;
  return done(await reply(project, content, { ...baseMeta, validation }, valid));
}
