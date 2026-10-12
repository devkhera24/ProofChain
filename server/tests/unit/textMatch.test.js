import { describe, it, expect } from "vitest";
import { matchQuote, normalizeWithMap, NEAR_MATCH_THRESHOLD } from "../../src/services/validation/textMatch.js";

// A made-up passage (no real paper text)
const passage =
  "In our toy benchmark, the adjacency-list layout answered three-hop queries roughly four times faster than " +
  "the join-based layout. However, the advantage shrank once the working set no longer fit in memory, and for " +
  "single-hop lookups the two layouts performed about the same.";

const expectFaithful = (r) => {
  expect(r.matched).toBe(true);
  expect(r.original).toBe(passage.slice(r.start, r.end)); // the UI shows real text, never the AI's version
};

describe("normalizeWithMap", () => {
  it("lowercases, unifies quotes/dashes, collapses whitespace and maps back to original indexes", () => {
    const src = "  A\u2019b \u201CC\u201D\n\n d\u2014e  ";
    const { text, map } = normalizeWithMap(src);
    expect(text).toBe(`a'b "c" d-e`);
    expect(map).toHaveLength(text.length);
    expect(src[map[0]]).toBe("A");
    expect(src[map[text.length - 1]]).toBe("e");
  });
});

describe("matchQuote — exact (L4)", () => {
  it("finds a verbatim quote", () => {
    const r = matchQuote("the advantage shrank once the working set no longer fit in memory", passage);
    expect(r).toMatchObject({ matched: true, matchType: "exact", score: 1 });
    expect(r.original).toBe("the advantage shrank once the working set no longer fit in memory");
    expectFaithful(r);
  });

  it("ignores case, curly quotes, dashes and whitespace differences", () => {
    const r = matchQuote("\u201CThe  Adjacency\u2013list layout\nanswered three\u2010hop queries\u201D", passage);
    expect(r).toMatchObject({ matched: true, matchType: "exact" });
    expect(r.original).toBe("the adjacency-list layout answered three-hop queries");
    expectFaithful(r);
  });

  it("ignores wrapping quote marks, ellipses and a trailing full stop", () => {
    for (const q of [
      '"for single-hop lookups the two layouts performed about the same."',
      "\u2026for single-hop lookups the two layouts performed about the same\u2026",
      "'for single-hop lookups the two layouts performed about the same'",
    ]) {
      const r = matchQuote(q, passage);
      expect(r.matchType).toBe("exact");
      expect(r.original).toBe("for single-hop lookups the two layouts performed about the same");
    }
  });

  it("maps offsets correctly when the passage has irregular whitespace", () => {
    const messy = passage.replace("However, the", "However,\n\n   the");
    const r = matchQuote("However, the advantage shrank", messy);
    expect(r.matchType).toBe("exact");
    expect(r.original).toBe("However,\n\n   the advantage shrank");
    expect(r.original).toBe(messy.slice(r.start, r.end));
  });
});

describe("matchQuote — near match", () => {
  it("accepts one changed word in twenty as a near_match, ending on a word boundary", () => {
    const quote =
      "the adjacency-list layout answered three-hop queries roughly five times faster than the join-based layout. However, the advantage shrank once the";
    expect(quote.split(" ")).toHaveLength(20); // "five" instead of "four"
    const r = matchQuote(quote, passage);
    expect(r.matchType).toBe("near_match");
    expect(r.score).toBeGreaterThanOrEqual(NEAR_MATCH_THRESHOLD);
    expect(r.score).toBeLessThan(1);
    expect(r.original).toMatch(/^the adjacency-list layout answered three-hop queries roughly four times faster/);
    expect(r.original).toMatch(/advantage shrank once the$/);
    expectFaithful(r);
  });

  it("accepts a dropped word in a long quote", () => {
    const r = matchQuote(
      "the advantage shrank once the working set no longer fit in memory, and for single-hop lookups the layouts performed about the same",
      passage,
    );
    expect(r.matchType).toBe("near_match");
    expectFaithful(r);
  });
});

describe("matchQuote — rejections", () => {
  it("rejects a paraphrase", () => {
    const r = matchQuote("adjacency lists were about 4x quicker for multi-hop traversals than joins", passage);
    expect(r.matched).toBe(false);
    expect(r.score).toBeLessThan(NEAR_MATCH_THRESHOLD);
  });

  it("rejects a fabricated quote", () => {
    expect(matchQuote("the join-based layout outperformed adjacency lists on every workload we tested", passage).matched).toBe(false);
  });

  it("rejects a quote whose meaning was flipped by changing several words", () => {
    expect(matchQuote("the advantage grew once the working set no longer fit on disk", passage).matched).toBe(false);
  });

  it("rejects empty, missing and very short quotes", () => {
    for (const q of ["", null, undefined, "the", "layout", '"  ..."']) expect(matchQuote(q, passage).matched).toBe(false);
    expect(matchQuote("anything at all here", "").matched).toBe(false);
  });

  it("rejects a quote longer than the passage that only partly overlaps it", () => {
    const r = matchQuote(`${passage} Additionally, the authors recommend adjacency lists for all production systems.`, passage);
    expect(r.matched).toBe(false);
  });
});
