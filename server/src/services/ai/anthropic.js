import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { callAi } from "./common.js";

let client;
// Retries are handled by withBackoff (shared with Gemini), so the SDK's own retries are off
const getClient = () => (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 120_000 }));

export const CLAUDE_INFO = { service: "Claude", model: env.ANTHROPIC_MODEL, modelVar: "ANTHROPIC_MODEL", keyVar: "ANTHROPIC_API_KEY" };
const MAX_TOKENS = 16_000; // thinking counts toward max_tokens, so leave room beyond the visible reply

/**
 * One Claude generation; returns the text. Current Claude models reject non-default sampling parameters,
 * so no temperature is sent; `output_config.effort` (ANTHROPIC_EFFORT) controls how much the model thinks.
 * JSON is requested in the prompt and validated by generateJson (L5), like for every provider.
 */
export async function claudeComplete({ task, system, prompt, json = false }) {
  const res = await callAi(
    task,
    () =>
      getClient().messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system: json ? `${system}\n\nReply with a single JSON value only: no prose, no Markdown code fences.` : system,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: env.ANTHROPIC_EFFORT },
      }),
    CLAUDE_INFO,
  );
  if (res.stop_reason === "refusal") throw new AppError(502, "The AI declined to answer this request.", { task });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  // A truncated reply is still returned: generateJson rejects invalid JSON and asks again
  return text;
}
