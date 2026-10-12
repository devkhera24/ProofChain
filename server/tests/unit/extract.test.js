import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractHtml } from "../../src/services/ingestion/extractHtml.js";
import { extractPdf } from "../../src/services/ingestion/extractPdf.js";

const fixture = (name) => readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

describe("extractHtml", () => {
  it("keeps only the article paragraphs, separated by blank lines", async () => {
    const out = extractHtml(await fixture("article.html"), "https://blog.example.com/posts/index-choice");
    const paras = out.pages[0].split("\n\n");
    const body = paras.filter((p) => /^The (first|second|third|fourth|fifth) paragraph|^This is the first/.test(p));
    expect(body).toHaveLength(5);
    expect(body[0]).toMatch(/^This is the first paragraph of a fictional article/);
    expect(body[0]).not.toMatch(/\s{2,}/); // whitespace inside a block is collapsed
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0]).not.toMatch(/ADVERTISEMENT|Subscribe|Copyright|tracking/);
  });

  it("returns title and metadata", async () => {
    const out = extractHtml(await fixture("article.html"), "https://blog.example.com/posts/index-choice");
    expect(out.title).toMatch(/Why Index Choice Matters for Graph Queries/);
    expect(out.byline).toMatch(/Jane Example/);
    expect(out.siteName).toBe("Example Tech Blog");
    expect(out.publishedTime).toBe("2024-03-05T10:00:00Z");
  });

  it("rejects pages with too little readable text", () => {
    expect(() => extractHtml("<html><body><p>Hi.</p></body></html>", "https://example.com")).toThrow(/too little readable text|readable content/);
  });
});

async function makePdf(pageTexts) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Test Fixture PDF");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const lines of pageTexts) {
    const page = pdf.addPage([600, 800]);
    let y = 750;
    for (const line of lines) {
      if (line === "") y -= 10; // extra gap → paragraph break
      else page.drawText(line, { x: 50, y, size: 11, font });
      y -= 13; // normal line spacing for 11pt text
    }
  }
  return Buffer.from(await pdf.save());
}

const lorem = (n) => `Line ${n} of a generated test document about indexing and query planning.`;

describe("extractPdf", () => {
  it("returns one text per page and the document title", async () => {
    const buf = await makePdf([
      [lorem(1), lorem(2), "", lorem(3)],
      [lorem(4), lorem(5)],
    ]);
    const out = await extractPdf(buf);
    expect(out.pages).toHaveLength(2);
    expect(out.title).toBe("Test Fixture PDF");
    expect(out.truncated).toBe(false);
    expect(out.pages[0]).toContain(lorem(1));
    expect(out.pages[0]).toContain(lorem(3));
    expect(out.pages[1]).toContain(lorem(5));
    // lines 1–2 share a paragraph (one line break); the extra gap before line 3 is a paragraph break
    expect(out.pages[0]).toMatch(new RegExp(`${lorem(1)}\\n${lorem(2)}\\n\\n${lorem(3)}`));
    expect(out.pages[1]).toMatch(new RegExp(`${lorem(4)}\\n${lorem(5)}`));
  });

  it("rejects PDFs without extractable text", async () => {
    await expect(extractPdf(await makePdf([[], []]))).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/no extractable text/) });
  });

  it("rejects data that is not a PDF", async () => {
    await expect(extractPdf(Buffer.from("not a pdf"))).rejects.toMatchObject({ status: 422, message: "Could not read this PDF" });
  });
});
