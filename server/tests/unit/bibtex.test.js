import { describe, it, expect } from "vitest";
import { buildBibtex, escapeBib, baseKey } from "../../src/services/export/bibtex.js";

// Generated fixtures: invented-looking titles, DOIs use the 10.5555 example prefix.
const paper = (over = {}) => ({
  kind: "paper",
  status: "ready",
  title: "Fixture study of graph storage",
  authors: ["Ada Example", "Ben Sample"],
  year: 2020,
  venue: "Fixture Journal",
  ids: { doi: "10.5555/fixture-001" },
  ...over,
});

describe("bibtex export", () => {
  it("escapes special characters", () => {
    expect(escapeBib("R&D 50% $x$ #1 a_b {c} ~ ^ \\")).toBe("R\\&D 50\\% \\$x\\$ \\#1 a\\_b \\{c\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}");
  });

  it("builds keys from first author, year and first title word, including 'Last, First' names and accents", () => {
    expect(baseKey(paper())).toBe("example2020fixture");
    expect(baseKey(paper({ authors: ["Müller, Jörg"], title: "Ärger with queries" }))).toBe("muller2020arger");
    expect(baseKey(paper({ authors: [], year: undefined, title: "" }))).toBe("anonnduntitled");
  });

  it("includes only verified papers and citable web pages, with a/b suffixes for colliding keys", () => {
    const bib = buildBibtex([
      paper(),
      paper({ ids: { s2Id: "fixture-s2-1" }, venue: undefined, title: "Fixture study two" }),
      paper({ ids: {} }), // no DOI/S2 id: not verified
      { kind: "pdf", status: "ready", title: "Uploaded notes", fileName: "notes.pdf" },
      { kind: "url", status: "ready", title: "Fixture blog post on 100% speedups", url: "https://example.com/post?a=1&b={2}", retrievedAt: new Date("2026-01-02") },
      { kind: "url", status: "failed", title: "Broken", url: "https://example.com/broken" },
    ]);
    expect(bib).toContain("@article{example2020fixturea,");
    expect(bib).toContain("@misc{example2020fixtureb,");
    expect(bib).toContain("  author = {Ada Example and Ben Sample}");
    expect(bib).toContain("  doi = {10.5555/fixture-001}");
    expect(bib).toContain("  note = {Semantic Scholar ID fixture-s2-1}");
    expect(bib).toContain("@misc{anonndfixture,");
    expect(bib).toContain("  title = {Fixture blog post on 100\\% speedups}");
    expect(bib).toContain("  url = {https://example.com/post?a=1&b=%7B2%7D}");
    expect(bib).toContain("  note = {Accessed 2026-01-02}");
    expect(bib).toContain("2 sources were left out because their metadata is not verified");
    expect(bib).not.toContain("Uploaded notes");
    expect(bib).not.toContain("Broken");
    expect(bib.match(/^@(article|misc)\{/gm)).toHaveLength(3);
  });
});
