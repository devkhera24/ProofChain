import { describe, it, expect } from "vitest";
import { normalizeText, joinPages, pageForOffset } from "../../src/services/ingestion/normalize.js";

describe("normalizeText", () => {
  it("unifies curly quotes, primes and dashes", () => {
    expect(normalizeText("\u201CIt\u2019s\u201D \u2014 a \u2013 b \u2212 c \u2032x\u2033")).toBe(`"It's" - a - b - c 'x"`);
  });

  it("re-joins words hyphenated across a line break only before a lowercase letter", () => {
    expect(normalizeText("graph-\ndatabase")).toBe("graphdatabase");
    expect(normalizeText("Multi-\nHop")).toBe("Multi- Hop");
    expect(normalizeText("2019-\n2020")).toBe("2019- 2020");
  });

  it("removes soft hyphens and normalises CRLF, tabs and non-breaking spaces", () => {
    expect(normalizeText("con\u00ADsolidation")).toBe("consolidation");
    expect(normalizeText("a\r\nb\rc")).toBe("a b c");
    expect(normalizeText("a\t\u00A0 b")).toBe("a b");
  });

  it("keeps paragraph breaks and turns single newlines into spaces", () => {
    expect(normalizeText("  Line one\nline two.\n\n\n  Next   para\n \nlast ")).toBe("Line one line two.\n\nNext para\n\nlast");
  });
});

describe("joinPages / pageForOffset", () => {
  it("records where each page starts in the canonical text", () => {
    const { text, pageStarts } = joinPages(["First page.", "Second\npage.", "Third."]);
    expect(text).toBe("First page.\n\nSecond page.\n\nThird.");
    expect(pageStarts).toEqual([0, 13, 27]);
    pageStarts.forEach((s, i) => expect(text.slice(s)).toMatch(["First", "Second", "Third"][i]));
  });

  it("does not add blank paragraphs for empty pages", () => {
    const { text, pageStarts } = joinPages(["A.", "  \n ", "B."]);
    expect(text).toBe("A.\n\nB.");
    expect(pageStarts).toEqual([0, 2, 4]);
    expect(pageForOffset(pageStarts, 4)).toBe(3); // offset of "B." belongs to page 3, not the empty page 2
  });

  it("returns 1-based pages", () => {
    const starts = [0, 13, 27];
    expect(pageForOffset(starts, 0)).toBe(1);
    expect(pageForOffset(starts, 12)).toBe(1);
    expect(pageForOffset(starts, 13)).toBe(2);
    expect(pageForOffset(starts, 100)).toBe(3);
    expect(pageForOffset([0], 5)).toBe(1);
  });
});
