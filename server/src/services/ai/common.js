import pLimit from "p-limit";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

/** Shared across providers: at most AI_CONCURRENCY model calls at once (protects rate limits). */
export const aiLimit = pLimit(env.AI_CONCURRENCY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = [429, 500, 502, 503, 504, 529]; // 529 = Anthropic "overloaded"
const MAX_WAIT_MS = 20_000; // per retry
const MAX_TOTAL_WAIT_MS = 60_000; // keeps a chat turn well inside the client's 120 s timeout

/** How long the provider asked us to wait: Anthropic's `retry-after` header, or Gemini's `retryDelay` in the body. */
export function retryAfterMs(err) {
  const header = err?.headers?.get?.("retry-after") ?? err?.headers?.["retry-after"];
  const seconds = Number(header ?? err?.message?.match(/"retryDelay"\s*:\s*"([\d.]+)s"|retry in ([\d.]+)\s*s/i)?.slice(1).find(Boolean));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/** A daily quota won't reset by retrying in a few seconds. */
const isDailyQuota = (err) => /per ?day|daily/i.test(err?.message ?? "");

export async function withBackoff(fn, { retries = 4, base = 1000, task = "unknown" } = {}) {
  let waited = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status ?? err?.code;
      if (!RETRYABLE.includes(Number(status)) || attempt >= retries || isDailyQuota(err)) throw err;
      const wait = Math.min(retryAfterMs(err) ?? base * 2 ** attempt, MAX_WAIT_MS) + Math.random() * 250;
      if (waited + wait > MAX_TOTAL_WAIT_MS) throw err;
      waited += wait;
      logger.warn({ task, status, attempt, wait: Math.round(wait) }, "AI call failed, backing off");
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
  if (status === 429 && isDailyQuota(err)) return new AppError(503, `The ${service} daily quota is used up. Try again tomorrow, or an administrator can upgrade the plan for ${keyVar}.`, { task, service });
  if (status === 429) return new AppError(503, `The ${service} service is rate-limiting requests right now. Please try again in a minute.`, { task, service });
  if (status === 529) return new AppError(503, `The ${service} service is overloaded right now. Please try again in a minute.`, { task, service });
  if (/credit balance/i.test(err?.message ?? "")) return new AppError(502, `The ${service} account has no credit left. An administrator needs to add credit for ${keyVar}.`, { task, service });
  if (status === 400) return new AppError(502, "The AI service couldn't process this request.", { task });
  return new AppError(503, "The AI service is unavailable right now. Please try again shortly.", { task });
}

/** Every model request: concurrency limit → retry with backoff → readable error. */
export const callAi = (task, fn, info) =>
  aiLimit(() => withBackoff(fn, { task })).catch((err) => {
    throw toAiError(err, task, info);
  });
