import { GoogleGenAI } from "@google/genai";
import pLimit from "p-limit";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

let client;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }));
export const aiLimit = pLimit(env.AI_CONCURRENCY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withBackoff(fn, { retries = 4, base = 1000, task = "unknown" } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status ?? err?.code;
      const retryable = [429, 500, 502, 503, 504].includes(Number(status));
      if (!retryable || attempt >= retries) throw err;
      const wait = base * 2 ** attempt + Math.random() * 250;
      logger.warn({ task, status, attempt, wait }, "Gemini call failed, backing off");
      await sleep(wait);
    }
  }
}

/**
 * Gemini/HTTP failure → an AppError with a message people can act on. The upstream body (often raw JSON)
 * is logged with the task name, never shown to users.
 */
export function toAiError(err, task, { model = env.GEMINI_MODEL, variable = "GEMINI_MODEL" } = {}) {
  if (err instanceof AppError) return err;
  const status = Number(err?.status ?? err?.code);
  logger.error({ task, status, err: err?.message?.slice(0, 500) }, "Gemini call failed");
  if (status === 404) return new AppError(502, `The AI model "${model}" isn't available. An administrator needs to update ${variable}.`, { task });
  if (status === 401 || status === 403) return new AppError(502, "The AI service rejected the API key. An administrator needs to check GEMINI_API_KEY.", { task });
  if (status === 429) return new AppError(503, "The AI service is busy right now (rate limit). Please try again in a minute.", { task });
  if (status === 400) return new AppError(502, "The AI service couldn't process this request.", { task });
  return new AppError(503, "The AI service is unavailable right now. Please try again shortly.", { task });
}

/** Every Gemini request: concurrency limit → retry with backoff → readable error. */
export const callGemini = (task, fn, modelInfo) =>
  aiLimit(() => withBackoff(fn, { task })).catch((err) => {
    throw toAiError(err, task, modelInfo);
  });

const stripFences = (s) => s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
const formatIssues = (zodError) =>
  zodError.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");

/**
 * Ask Gemini for JSON and validate it with a Zod schema (validation layer L5).
 * @param {object} o
 * @param {string} o.task      short name for logs, e.g. "stance.classify"
 * @param {string} o.system    system instruction
 * @param {string} o.prompt    user prompt (must describe the JSON shape)
 * @param {import('zod').ZodTypeAny} o.schema
 * @param {() => any} o.mock   returns a valid object when AI_MOCK=true
 * @param {(data:any) => string|null} [o.check] extra semantic check; return an error message to trigger a retry
 */
export async function generateJson({ task, system, prompt, schema, mock, check, temperature = 0.2, maxRetries = 1 }) {
  if (env.AI_MOCK) {
    if (!mock) throw new Error(`No mock provided for AI task "${task}"`);
    const data = schema.parse(mock());
    const problem = check?.(data); // mocks go through the same semantic checks as real output
    if (problem) throw new AppError(502, `AI output failed validation for ${task}`, { reason: problem });
    return data;
  }

  let currentPrompt = prompt;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await callGemini(task, () =>
      getClient().models.generateContent({
        model: env.GEMINI_MODEL,
        contents: currentPrompt,
        config: { systemInstruction: system, temperature, responseMimeType: "application/json" },
      }),
    );

    let problem;
    try {
      const parsed = schema.safeParse(JSON.parse(stripFences(res.text ?? "")));
      if (parsed.success) {
        problem = check?.(parsed.data) ?? null;
        if (!problem) return parsed.data;
      } else {
        problem = formatIssues(parsed.error);
      }
    } catch (e) {
      problem = `invalid JSON (${e.message})`;
    }

    lastError = problem;
    logger.warn({ task, attempt, problem }, "AI output rejected");
    currentPrompt = `${prompt}\n\nYour previous reply was rejected: ${problem}\nReply again with corrected JSON only.`;
  }
  throw new AppError(502, `AI output failed validation for ${task}`, { reason: lastError });
}

/** Plain text generation (used rarely; prefer generateJson). */
export async function generateText({ task = "text", system, prompt, temperature = 0.3, mock }) {
  if (env.AI_MOCK) return mock?.() ?? "Mock response.";
  const res = await callGemini(task, () =>
    getClient().models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: { systemInstruction: system, temperature },
    }),
  );
  return res.text ?? "";
}

export { getClient };
