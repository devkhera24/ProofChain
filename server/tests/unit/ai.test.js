import { describe, it, expect } from "vitest";
import { z } from "zod";
import { env } from "../../src/config/env.js";
import { generateJson, generateText } from "../../src/services/ai/llm.js";
import { embedTexts, embedOne } from "../../src/services/ai/embeddings.js";
import { formatItems, idsCheck } from "../../src/services/ai/prompts/util.js";
import { cosine, norm } from "../../src/utils/vectors.js";

describe("AI client in mock mode", () => {
  it("runs with AI_MOCK=true", () => {
    expect(env.AI_MOCK).toBe(true);
  });

  it("generateJson returns the schema-parsed mock", async () => {
    const schema = z.object({ stance: z.enum(["supports", "contradicts"]), score: z.coerce.number() });
    const out = await generateJson({ task: "t", system: "s", prompt: "p", schema, mock: () => ({ stance: "supports", score: "0.9", extra: 1 }) });
    expect(out).toEqual({ stance: "supports", score: 0.9 }); // coerced, unknown keys stripped
  });

  it("generateJson throws without a mock, or when the mock is invalid", async () => {
    const schema = z.object({ ok: z.boolean() });
    await expect(generateJson({ task: "nomock", schema })).rejects.toThrow('No mock provided for AI task "nomock"');
    await expect(generateJson({ task: "bad", schema, mock: () => ({ ok: "yes" }) })).rejects.toThrow();
  });

  it("generateJson runs the semantic check on mock output too", async () => {
    const schema = z.object({ id: z.string() });
    const check = (d) => (d.id === "P-1" ? null : `unknown IDs referenced: ${d.id}`);
    expect(await generateJson({ task: "ok", schema, check, mock: () => ({ id: "P-1" }) })).toEqual({ id: "P-1" });
    const err = await generateJson({ task: "bad", schema, check, mock: () => ({ id: "P-9" }) }).catch((e) => e);
    expect(err).toMatchObject({ status: 502, details: { reason: "unknown IDs referenced: P-9" } });
  });

  it("generateText returns the mock or a default", async () => {
    expect(await generateText({ prompt: "x", mock: () => "hello" })).toBe("hello");
    expect(await generateText({ prompt: "x" })).toBe("Mock response.");
  });

  it("embedTexts returns deterministic unit vectors of length EMBED_DIM", async () => {
    const [a, b] = await embedTexts(["Sleep improves memory", "Sleep improves memory"]);
    expect(a).toHaveLength(env.EMBED_DIM);
    expect(norm(a)).toBeCloseTo(1);
    expect(a).toEqual(b);
    expect(await embedTexts([])).toEqual([]);
  });

  it("texts sharing words are more similar than unrelated texts", async () => {
    const q = await embedOne("sleep deprivation impairs memory consolidation");
    const [related, unrelated] = await embedTexts([
      "memory consolidation happens during sleep",
      "quarterly revenue grew in the retail sector",
    ]);
    expect(cosine(q, related)).toBeGreaterThan(cosine(q, unrelated));
  });
});

describe("prompt utils", () => {
  it("formatItems prefixes IDs and truncates text", () => {
    const s = formatItems([{ id: "P-1", text: "abcdef" }, { id: "P-2", text: "xyz" }], 3);
    expect(s).toBe("[P-1] abc\n\n[P-2] xyz");
  });

  it("idsCheck flags IDs that were not given", () => {
    const check = idsCheck(new Set(["P-1", "P-2"]), (d) => d.links.map((l) => l.passageId));
    expect(check({ links: [{ passageId: "P-1" }, { passageId: "P-2" }] })).toBeNull();
    expect(check({ links: [{ passageId: "P-1" }, { passageId: "P-99" }] })).toMatch(/unknown IDs referenced: P-99/);
  });
});
