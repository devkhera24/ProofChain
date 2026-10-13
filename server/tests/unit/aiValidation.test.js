// Exercises the real (non-mock) generateJson path with AI_PROVIDER=gemini against a fake Gemini client — no network.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const replies = [];
const calls = [];
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (params) => {
        calls.push(params);
        const next = replies.shift();
        if (next instanceof Error) throw next;
        return { text: next };
      },
    };
  },
}));
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const { env } = await importOriginal();
  return { env: { ...env, AI_MOCK: false, AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-key" } };
});

const { generateJson } = await import("../../src/services/ai/llm.js");
const { withBackoff, toAiError } = await import("../../src/services/ai/common.js");
const schema = z.object({ passageId: z.string(), stance: z.enum(["supports", "contradicts", "inconclusive"]) });
const base = { task: "stance.test", system: "sys", prompt: "PROMPT", schema };

describe("generateJson validation loop (L5)", () => {
  beforeEach(() => {
    replies.length = 0;
    calls.length = 0;
  });

  it("accepts valid JSON, including fenced JSON", async () => {
    replies.push('```json\n{"passageId":"P-1","stance":"supports"}\n```');
    expect(await generateJson(base)).toEqual({ passageId: "P-1", stance: "supports" });
    expect(calls[0]).toMatchObject({ contents: "PROMPT", config: { systemInstruction: "sys", responseMimeType: "application/json" } });
  });

  it("retries once with the rejection reason after a schema failure", async () => {
    replies.push('{"passageId":"P-1","stance":"agrees"}', '{"passageId":"P-1","stance":"supports"}');
    expect(await generateJson(base)).toEqual({ passageId: "P-1", stance: "supports" });
    expect(calls).toHaveLength(2);
    expect(calls[1].contents).toMatch(/^PROMPT\n\nYour previous reply was rejected: stance: /);
  });

  it("retries after a failed semantic check, then throws 502 with the reason", async () => {
    replies.push('{"passageId":"P-99","stance":"supports"}', "not json at all");
    const check = (d) => (d.passageId === "P-1" ? null : `unknown IDs referenced: ${d.passageId}`);
    const err = await generateJson({ ...base, check }).catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.message).toBe("AI output failed validation for stance.test");
    expect(err.details.reason).toMatch(/invalid JSON/);
    expect(calls[1].contents).toMatch(/unknown IDs referenced: P-99/);
  });
});

describe("withBackoff", () => {
  it("retries rate limits and server errors, not client errors", async () => {
    let n = 0;
    const flaky = async () => {
      if (++n < 3) throw Object.assign(new Error("rate limited"), { status: 429 });
      return "ok";
    };
    expect(await withBackoff(flaky, { base: 1 })).toBe("ok");
    expect(n).toBe(3);

    let m = 0;
    const bad = async () => {
      m++;
      throw Object.assign(new Error("bad request"), { status: 400 });
    };
    await expect(withBackoff(bad, { base: 1 })).rejects.toThrow("bad request");
    expect(m).toBe(1);
  });

  it("gives up after the retry limit", async () => {
    let n = 0;
    const down = async () => {
      n++;
      throw Object.assign(new Error("unavailable"), { status: 503 });
    };
    await expect(withBackoff(down, { retries: 2, base: 1 })).rejects.toThrow("unavailable");
    expect(n).toBe(3);
  });
});

describe("upstream AI errors", () => {
  beforeEach(() => {
    replies.length = 0;
  });
  const upstream = (status) =>
    Object.assign(new Error(`{"error":{"code":${status},"message":"raw upstream body","status":"X"}}`), { status });

  it("a retired model (404) becomes a readable 502 naming the variable, not the raw JSON", async () => {
    replies.push(upstream(404));
    const err = await generateJson({ ...base, mock: () => ({}) }).catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/^The AI model ".+" isn't available\. An administrator needs to update GEMINI_MODEL\.$/);
    expect(err.message).not.toContain("raw upstream body");
  });

  it("maps key, rate-limit and other failures", () => {
    expect(toAiError(upstream(403), "t", { service: "Gemini", keyVar: "GEMINI_API_KEY" }).message).toBe(
      "The Gemini service rejected the API key. An administrator needs to check GEMINI_API_KEY.",
    );
    expect(toAiError(upstream(429), "t")).toMatchObject({ status: 503, message: expect.stringMatching(/rate limit/) });
    expect(toAiError(new Error("socket hang up"), "t")).toMatchObject({ status: 503 });
    expect(toAiError(upstream(404), "embed.X", { model: "m-embed", modelVar: "GEMINI_EMBED_MODEL" }).message).toBe(
      'The AI model "m-embed" isn\'t available. An administrator needs to update GEMINI_EMBED_MODEL.',
    );
  });
});
