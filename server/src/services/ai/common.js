import pLimit from "p-limit";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

/** Shared across providers: at most AI_CONCURRENCY model calls at once (protects rate limits). */
export const aiLimit = pLimit(env.AI_CONCURRENCY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = [429, 500, 502, 503, 504, 529]; // 529 = Anthropic "overloaded"

export async function withBackoff(fn, { retries = 4, base = 1000, task = "unknown" } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status ?? err?.code;
      if (!RETRYABLE.includes(Number(status)) || attempt >= retries) throw err;
      const wait = base * 2 ** attempt + Math.random() * 250;
      logger.warn({ task, status, attempt, wait }, "AI call failed, backing off");
      await sleep(wait);
    }
  }
}

/**
 * Provider failure → an AppError with a message people can act on. The upstream body (often raw JSON)
 * is logged with the task name, never shown to users.
 * `info` = { service, model, modelVar, keyVar } names what an administrator would need to change.
 */
export function toAiError(err, task, info = {}) {
  if (err instanceof AppError) return err;
  const { service = "AI", model = "?", modelVar = "the model setting", keyVar = "the API key" } = info;
  const status = Number(err?.status ?? err?.code);
  logger.error({ task, service, status, err: err?.message?.slice(0, 500) }, "AI call failed");
  if (status === 404) return new AppError(502, `The AI model "${model}" isn't available. An administrator needs to update ${modelVar}.`, { task });
  if (status === 401 || status === 403) return new AppError(502, `The ${service} service rejected the API key. An administrator needs to check ${keyVar}.`, { task });
  if (status === 429 || status === 529) return new AppError(503, "The AI service is busy right now (rate limit). Please try again in a minute.", { task });
  if (status === 400) return new AppError(502, "The AI service couldn't process this request.", { task });
  return new AppError(503, "The AI service is unavailable right now. Please try again shortly.", { task });
}

/** Every model request: concurrency limit → retry with backoff → readable error. */
export const callAi = (task, fn, info) =>
  aiLimit(() => withBackoff(fn, { task })).catch((err) => {
    throw toAiError(err, task, info);
  });
