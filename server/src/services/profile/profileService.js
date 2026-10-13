import { InterestProfile } from "../../models/InterestProfile.js";
import { Project } from "../../models/Project.js";
import { Passage } from "../../models/Passage.js";
import { embedOne } from "../ai/embeddings.js";
import { generateJson } from "../ai/llm.js";
import * as rulePrompt from "../ai/prompts/feedbackRule.js";
import { enqueueCoalesced } from "../../jobs/runner.js";
import { weightedMean } from "../../utils/vectors.js";

const W = { topics: 0.3, sources: 0.3, questions: 0.4 };
const DECAY = 0.8; // weight of the i-th most recent question = DECAY^i
const MAX_QUESTIONS = 30;
const PASSAGE_SAMPLE = 60;

export async function ensureProfile(projectId, userId) {
  return InterestProfile.findOneAndUpdate(
    { projectId, userId },
    { $setOnInsert: { topics: [], questionHistory: [], exclusions: [] } },
    { upsert: true, new: true },
  );
}

/**
 * vector = 0.3·topics + 0.3·sources + 0.4·questions (each part skipped when empty; recent questions weigh more).
 */
export async function recomputeProfileVector(projectId, userId) {
  const project = await Project.findById(projectId);
  if (!project) return null;
  await ensureProfile(projectId, userId);
  const profile = await InterestProfile.findOne({ projectId, userId }).select("+vector +questionHistory.embedding");
  const topicsVec = project.topics.length ? await embedOne(project.topics.join(", "), "SEMANTIC_SIMILARITY") : null;

  // Sources: mean of a random sample of passage embeddings ($project, because `embedding` is select:false)
  const passages = await Passage.aggregate([
    { $match: { projectId: project._id } },
    { $sample: { size: PASSAGE_SAMPLE } },
    { $project: { embedding: 1 } },
  ]);
  const sourcesVec = weightedMean(passages.map((p) => [p.embedding, 1]));

  const qs = [...profile.questionHistory].sort((a, b) => b.at - a.at);
  const questionsVec = weightedMean(qs.map((q, i) => [q.embedding, DECAY ** i]));

  profile.vector =
    weightedMean([
      [topicsVec, W.topics],
      [sourcesVec, W.sources],
      [questionsVec, W.questions],
    ]) ?? [];
  profile.topics = project.topics;
  profile.level = project.level;
  await profile.save();
  return profile;
}

/** Debounced recompute (job key profile:<projectId>:<userId>). */
export const scheduleProfileRefresh = (projectId, userId) =>
  enqueueCoalesced(`profile:${projectId}:${userId}`, () => recomputeProfileVector(projectId, userId));

/** Recompute every member's profile (after a source becomes ready or the topics change). */
export async function scheduleProjectProfiles(projectId) {
  const project = await Project.findById(projectId).select("members").lean();
  project?.members.forEach((m) => scheduleProfileRefresh(projectId, m.userId));
}

export async function recordQuestion(projectId, userId, text, embedding) {
  embedding ??= await embedOne(text, "SEMANTIC_SIMILARITY");
  await ensureProfile(projectId, userId);
  await InterestProfile.updateOne(
    { projectId, userId },
    { $push: { questionHistory: { $each: [{ text, embedding, at: new Date() }], $slice: -MAX_QUESTIONS } } },
  );
  scheduleProfileRefresh(projectId, userId);
}

/**
 * Turn a "not relevant because …" reason into an exclusion rule (or none).
 * @returns {Promise<{ concept, strength, reason, id } | null>}
 */
export async function addFeedbackRule(projectId, userId, { paperTitle, reason }) {
  if (!reason?.trim()) return null;
  const input = { paperTitle, reason: reason.trim() };
  const { rule } = await generateJson({
    task: "feedback.rule",
    system: rulePrompt.system,
    prompt: rulePrompt.build(input),
    schema: rulePrompt.schema,
    mock: () => rulePrompt.mock(input),
  });
  if (!rule) return null;
  await ensureProfile(projectId, userId);
  const profile = await InterestProfile.findOne({ projectId, userId });
  const same = profile.exclusions.find((e) => e.concept.toLowerCase() === rule.concept.toLowerCase());
  if (same) {
    if (rule.strength === "hard") same.strength = "hard"; // never weaken an existing rule automatically
    await profile.save();
    return { id: same.id, concept: same.concept, strength: same.strength, reason: same.reason };
  }
  const embedding = await embedOne(rule.concept, "SEMANTIC_SIMILARITY");
  profile.exclusions.push({ ...rule, reason: input.reason, embedding, createdAt: new Date() });
  await profile.save();
  const added = profile.exclusions.at(-1);
  return { id: added.id, concept: added.concept, strength: added.strength, reason: added.reason };
}

/** What the profile panel shows (no vectors). */
export async function getProfileView(project, userId) {
  const profile = await ensureProfile(project._id, userId);
  const questions = [...profile.questionHistory].sort((a, b) => b.at - a.at);
  return {
    topics: project.topics,
    level: project.level,
    goal: project.goal,
    recentThemes: questions.slice(0, 5).map((q) => ({ text: q.text, at: q.at })),
    questionCount: questions.length,
    exclusions: profile.exclusions.map((e) => ({ id: e.id, concept: e.concept, strength: e.strength, reason: e.reason, createdAt: e.createdAt })),
    updatedAt: profile.updatedAt,
  };
}
