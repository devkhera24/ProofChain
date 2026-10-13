import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { claudeComplete } from "./anthropic.js";
import { geminiComplete } from "./gemini.js";

/** Text generation goes to AI_PROVIDER (Claude by default); embeddings always use Gemini (embeddings.js). */
const complete = (opts) => (env.AI_PROVIDER === "gemini" ? geminiComplete(opts) : claudeComplete(opts));

const stripFences = (s) => s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
const formatIssues = (zodError) =>
  zodError.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");

/**
 * Ask the model for JSON and validate it with a Zod schema (validation layer L5).
 * @param {object} o
 * @param {string} o.task      short name for logs, e.g. "stance.classify"
 * @param {string} o.system    system instruction
 * @param {string} o.prompt    user prompt (must describe the JSON shape)
 * @param {import('zod').ZodTypeAny} o.schema
 * @param {() => any} o.mock   returns a valid object when AI_MOCK=true
 * @param {(data:any) => string|null} [o.check] extra semantic check; return an error message to trigger a retry
 * @param {number} [o.temperature] used by Gemini only (current Claude models don't accept it)
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
    const text = await complete({ task, system, prompt: currentPrompt, json: true, temperature });

    let problem;
    try {
      const parsed = schema.safeParse(JSON.parse(stripFences(text)));
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
  return complete({ task, system, prompt, temperature });
}
