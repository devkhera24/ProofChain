import { describe, it, expect } from "vitest";
import { metadataConsistent, titleSimilarity, normTitle, lastName } from "../../src/services/validation/metadata.js";
import { createPipelineLog } from "../../src/services/validation/pipelineLog.js";

// Fictional records
const paper = { title: "Adjacency Layouts for Multi-Hop Queries: A Toy Study", year: 2021, authors: ["Ada Example", "Bo Sample"] };

describe("normTitle / titleSimilarity / lastName", () => {
  it("normalises case, accents and punctuation", () => {
    expect(normTitle("  Caf\u00E9-Style  Graphs: An Overview! ")).toBe("cafe style graphs an overview");
    expect(titleSimilarity("A B", "")).toBe(0);
    expect(titleSimilarity("Same Title", "same title")).toBe(1);
  });

  it("extracts last names in both name orders", () => {
    expect(lastName("Ada Example")).toBe("example");
    expect(lastName("Example, Ada")).toBe("example");
    expect(lastName("Jos\u00E9 de la Cruz")).toBe("cruz");
    expect(lastName("")).toBe("");
  });
});

describe("metadataConsistent (L2)", () => {
  it("passes the same paper with different punctuation, case and author order/format", () => {
    const other = { title: "adjacency layouts for multi-hop queries - a toy study.", year: 2021, authors: ["Sample, Bo", "Example, Ada"] };
    expect(metadataConsistent(paper, other)).toMatchObject({ ok: true, reasons: [] });
  });

  it("allows a one-year difference (preprint vs published)", () => {
    expect(metadataConsistent(paper, { ...paper, year: 2022 }).ok).toBe(true);
  });

  it("fails a different paper", () => {
    const r = metadataConsistent(paper, { title: "Columnar Storage for Analytical Workloads", year: 2021, authors: ["Ada Example"] });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/^title_mismatch\(0\.\d\d\)$/);
  });

  it("fails a year off by three", () => {
    expect(metadataConsistent(paper, { ...paper, year: 2018 }).reasons).toEqual(["year_mismatch(2021\u22602018)"]);
  });

  it("fails when no author is shared", () => {
    expect(metadataConsistent(paper, { ...paper, authors: ["Cy Other", "Di Another"] }).reasons).toEqual(["author_mismatch"]);
  });

  it("ignores a missing year or missing authors", () => {
    expect(metadataConsistent(paper, { title: paper.title }).ok).toBe(true);
    expect(metadataConsistent({ title: paper.title, authors: [] }, paper).ok).toBe(true);
  });

  it("can report several problems at once", () => {
    const r = metadataConsistent(paper, { title: "Something Else Entirely", year: 2010, authors: ["Nobody Here"] });
    expect(r.reasons).toHaveLength(3);
  });
});

describe("pipeline log", () => {
  it("formats info, pass, drop and retry lines", () => {
    const log = createPipelineLog("link C2");
    log.info("candidates", { passages: 25, sources: 3 });
    log.pass("L4", "P-14 exact");
    log.drop("L4", "P-9", "quote_not_found");
    log.retry("L5", "stance.classify", "invalid JSON");
    expect(log.lines).toHaveLength(4);
    expect(log.lines[0]).toMatch(/^\[\d\d:\d\d:\d\d\] link C2 candidates passages=25 sources=3$/);
    expect(log.lines[1]).toMatch(/L4 pass {2}P-14 exact$/);
    expect(log.lines[2]).toMatch(/L4 drop {2}P-9 {3}reason=quote_not_found$/);
    expect(log.lines[3]).toMatch(/L5 retry stance\.classify {2}reason=invalid JSON$/);
  });
});
