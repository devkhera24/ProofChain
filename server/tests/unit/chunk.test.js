import { describe, it, expect } from "vitest";
import { chunkText } from "../../src/services/ingestion/chunk.js";
import { joinPages } from "../../src/services/ingestion/normalize.js";

const sentence = (n) => `This is sentence number ${n} with enough words to be realistic.`;
const para = (from, count) => Array.from({ length: count }, (_, k) => sentence(from + k)).join(" ");

function expectInvariant(text, passages) {
  for (const p of passages) {
    expect(text.slice(p.charStart, p.charEnd)).toBe(p.text);
    expect(p.text).toBe(p.text.trim());
  }
}

describe("chunkText", () => {
  it("keeps the offset invariant on a multi-page, multi-paragraph document", () => {
    const { text, pageStarts } = joinPages([`${para(1, 6)}\n\n${para(7, 3)}`, `Short heading\n\n${para(10, 9)}`]);
    const passages = chunkText(text, pageStarts);
    expect(passages.length).toBeGreaterThan(4);
    expectInvariant(text, passages);
  });

  it("never crosses a paragraph and numbers paragraphs from 1", () => {
    const text = `${para(1, 3)}\n\n${para(4, 3)}`;
    const passages = chunkText(text);
    expect(passages.map((p) => p.paragraph)).toEqual([1, 2]);
    expect(passages.every((p) => !p.text.includes("\n"))).toBe(true);
  });

  it("windows up to maxSentences with a one-sentence overlap", () => {
    const text = para(1, 7);
    const passages = chunkText(text, [0], { maxSentences: 4 });
    expect(passages).toHaveLength(2);
    expect(passages[0].text).toBe(para(1, 4));
    expect(passages[1].text).toBe(para(4, 4)); // sentence 4 is shared
  });

  it("respects maxChars when grouping sentences", () => {
    const text = para(1, 4);
    const passages = chunkText(text, [0], { maxChars: 140 });
    expect(passages.every((p) => p.text.length <= 140)).toBe(true);
    expectInvariant(text, passages);
  });

  it("assigns pages from pageStarts", () => {
    const { text, pageStarts } = joinPages([para(1, 2), para(3, 2)]);
    expect(chunkText(text, pageStarts).map((p) => p.page)).toEqual([1, 2]);
  });

  it("keeps a short single-sentence paragraph but drops short trailing fragments", () => {
    expect(chunkText("Results").map((p) => p.text)).toEqual(["Results"]);
    const first = `${"Long sentence words ".repeat(3).trim()} here.`; // 65 chars
    const text = `${first} Ok.`;
    const passages = chunkText(text, [0], { maxChars: 66 }); // "Ok." can't join, and is under minChars
    expect(passages.map((p) => p.text)).toEqual([first]);
    expectInvariant(text, passages);
  });

  it("hard-splits a single sentence longer than maxChars at spaces", () => {
    const cells = Array.from({ length: 120 }, (_, k) => `cell${k}`).join(" "); // a flattened table, no full stops
    const passages = chunkText(cells, [0], { maxChars: 200, maxSentences: 1 });
    expect(passages.length).toBeGreaterThan(3);
    expect(passages.every((p) => p.text.length <= 200)).toBe(true);
    expect(passages.every((p) => !p.text.startsWith(" ") && !p.text.endsWith(" "))).toBe(true);
    expect(passages.every((p) => /^cell\d+( cell\d+)*$/.test(p.text))).toBe(true); // never cuts a word
    expect(passages.map((p) => p.text).join(" ")).toBe(cells); // nothing lost
    expectInvariant(cells, passages);
  });

  it("hard-splits mid-word only when there is no space at all", () => {
    const blob = "x".repeat(450);
    const passages = chunkText(blob, [0], { maxChars: 200 });
    expect(passages.map((p) => p.text.length)).toEqual([200, 200, 50]);
    expectInvariant(blob, passages);
  });

  it("returns nothing for empty text", () => {
    expect(chunkText("")).toEqual([]);
  });
});
