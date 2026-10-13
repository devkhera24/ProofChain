// The Claude provider (AI_PROVIDER=anthropic) against a fake Anthropic SDK — no network.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const replies = [];
const calls = [];
let clientOptions; // the client is created once, lazily
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(opts) {
      clientOptions = opts;
    }
    messages = {
      create: async (params) => {
        calls.push(params);
        const next = replies.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    };
  },
}));
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const { env } = await importOriginal();
  return { env: { ...env, AI_MOCK: false, AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "claude-sonnet-5-5", ANTHROPIC_EFFORT: "medium" } };
});

const { generateJson, generateText } = await import("../../src/services/ai/llm.js");
const schema = z.object({ passageId: z.string(), stance: z.enum(["supports", "contradicts", "inconclusive"]) });
const base = { task: "stance.test", system: "sys", prompt: "PROMPT", schema };
const reply = (text, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "thinking", thinking: "…" }, { type: "text", text }] });
const status = (code) => Object.assign(new Error(`{"type":"error","error":{"message":"raw ${code}"}}`), { status: code });
const requests = () => calls;

describe("Claude provider", () => {
  beforeEach(() => {
    replies.length = 0;
    calls.length = 0;
  });

  it("sends model, effort and a JSON instruction, never a temperature; reads only text blocks", async () => {
    replies.push(reply('{"passageId":"P-1","stance":"supports"}'));
    expect(await generateJson({ ...base, temperature: 0.2 })).toEqual({ passageId: "P-1", stance: "supports" });
    const [req] = requests();
    expect(req).toMatchObject({
      model: "claude-sonnet-5-5",
      messages: [{ role: "user", content: "PROMPT" }],
      output_config: { effort: "medium" },
    });
    expect(req.system).toMatch(/^sys\n\nReply with a single JSON value only/);
    expect(req).not.toHaveProperty("temperature");
    expect(req.max_tokens).toBeGreaterThanOrEqual(8000); // thinking counts toward max_tokens
  });

  it("disables the SDK's own retries (withBackoff handles them) and retries 529 overloaded", async () => {
    replies.push(status(529), reply('{"passageId":"P-2","stance":"contradicts"}'));
    expect(await generateJson(base)).toMatchObject({ passageId: "P-2" });
    expect(clientOptions).toMatchObject({ apiKey: "test-key", maxRetries: 0 });
  });

  it("retries invalid JSON (e.g. a reply cut off at max_tokens) with the reason, through the L5 loop", async () => {
    replies.push(reply('{"passageId":"P-1","sta', "max_tokens"), reply('{"passageId":"P-1","stance":"inconclusive"}'));
    expect(await generateJson(base)).toMatchObject({ stance: "inconclusive" });
    expect(requests()[1].messages[0].content).toMatch(/Your previous reply was rejected: invalid JSON/);
  });

  it("turns refusals and API errors into readable messages naming the Anthropic variables", async () => {
    replies.push({ stop_reason: "refusal", content: [] });
    await expect(generateJson(base)).rejects.toMatchObject({ status: 502, message: "The AI declined to answer this request." });

    replies.push(status(404));
    await expect(generateJson(base)).rejects.toMatchObject({
      message: 'The AI model "claude-sonnet-5-5" isn\'t available. An administrator needs to update ANTHROPIC_MODEL.',
    });
    replies.push(status(401));
    await expect(generateText({ system: "s", prompt: "p" })).rejects.toMatchObject({
      message: "The Claude service rejected the API key. An administrator needs to check ANTHROPIC_API_KEY.",
    });
  });

  it("generateText returns the joined text without the JSON instruction", async () => {
    replies.push({ stop_reason: "end_turn", content: [{ type: "text", text: "Hello " }, { type: "text", text: "there." }] });
    expect(await generateText({ task: "chat.smallTalk", system: "be kind", prompt: "hi" })).toBe("Hello there.");
    expect(requests()[0].system).toBe("be kind");
  });
});
