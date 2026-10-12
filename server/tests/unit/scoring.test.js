import { describe, it, expect } from "vitest";
import { scorePapers, qualityScore, preSort, WEIGHTS } from "../../src/services/recommender/scoring.js";
import { filterKnown, filterHardExclusions, allKeys } from "../../src/services/recommender/filter.js";
import { normalize } from "../../src/utils/vectors.js";

const v = (...xs) => normalize(xs);
const paper = (title, embedding, extra = {}) => ({ title, embedding, citationCount: 10, year: 2024, oaPdfUrl: null, ids: {}, ...extra });
const ctx = (extra = {}) => ({ questionVec: null, profileVec: [], gaps: [], softExclusions: [], seenEmbeddings: [], ...extra });
const silentLog = () => {
  const lines = [];
  return { lines, drop: (l, w, r) => lines.push(`${l} ${w} ${r}`), info: () => {} };
};

describe("scorePapers", () => {
  it("a paper aligned with a gap outranks an equally relevant paper when a gap exists", () => {
    const q = v(1, 0, 0);
    const a = paper("Aligned with gap", v(1, 1, 0));
    const b = paper("Not aligned", v(1, 0, 1));
    const gap = { embedding: v(0, 1, 0), weight: 0.9, claimId: "c1", humanId: "C2", type: "interested_party_only" };
    const [first, second] = scorePapers([b, a], ctx({ questionVec: q, gaps: [gap] }), 2026);
    expect(first.title).toBe("Aligned with gap");
    expect(first.gapTarget).toMatchObject({ humanId: "C2" });
    expect(second.gapTarget).toBeNull();
    expect(first.scoreBreakdown.question).toBeCloseTo(second.scoreBreakdown.question);
    // without the gap they tie
    const [x, y] = scorePapers([a, b], ctx({ questionVec: q }), 2026);
    expect(x.score).toBeCloseTo(y.score);
  });

  it("a soft exclusion lowers the score", () => {
    const p = paper("RDF stores", v(1, 0.2, 0));
    const base = scorePapers([p], ctx({ questionVec: v(1, 0, 0) }), 2026)[0];
    const excluded = scorePapers([p], ctx({ questionVec: v(1, 0, 0), softExclusions: [{ embedding: v(1, 0.2, 0) }] }), 2026)[0];
    expect(excluded.score).toBeLessThan(base.score);
    expect(excluded.scoreBreakdown.penalty).toBeCloseTo(0.4);
  });

  it("a near-duplicate of a paper already in the project is penalised", () => {
    const p = paper("Preprint version", v(1, 0, 0));
    const s = scorePapers([p], ctx({ profileVec: v(1, 0, 0), seenEmbeddings: [v(1, 0.01, 0)] }), 2026)[0];
    expect(s.scoreBreakdown.penalty).toBeGreaterThan(0.07);
  });

  it("with no question, the question weight goes to the profile", () => {
    const p = paper("Profile match", v(0, 1, 0));
    const s = scorePapers([p], ctx({ profileVec: v(0, 1, 0) }), 2026)[0];
    expect(s.scoreBreakdown.question).toBe(0);
    expect(s.score).toBeCloseTo(WEIGHTS.profile + WEIGHTS.question + WEIGHTS.quality * 1, 3);
    const withQ = scorePapers([p], ctx({ profileVec: v(0, 1, 0), questionVec: v(1, 0, 0) }), 2026)[0];
    expect(withQ.score).toBeCloseTo(WEIGHTS.profile + WEIGHTS.quality, 3);
  });

  it("open access adds a small bonus", () => {
    const [oa, closed] = scorePapers(
      [paper("Open", v(1, 0), { oaPdfUrl: "https://example.org/x.pdf" }), paper("Closed", v(1, 0))],
      ctx({ profileVec: v(1, 0) }),
      2026,
    );
    expect(oa.score - closed.score).toBeCloseTo(WEIGHTS.access);
  });
});

describe("qualityScore and preSort", () => {
  it("normalises by age: 200 citations in 2 years beats 1,000 in 20", () => {
    const young = { year: 2025, citationCount: 200 }; // age 2 → 100/yr
    const old = { year: 2007, citationCount: 1000 }; // age 20 → 50/yr
    expect(qualityScore(young, 100, 2026)).toBeCloseTo(1);
    expect(qualityScore(young, 100, 2026)).toBeGreaterThan(qualityScore(old, 100, 2026));
    expect(qualityScore({ year: 2026, citationCount: 0 }, 0, 2026)).toBe(0);
  });

  it("pre-sorts by search rank, then citations, and caps the pool", () => {
    const papers = Array.from({ length: 80 }, (_, i) => ({ title: `P${i}`, rank: i % 20, citationCount: i, year: 2020 }));
    const pool = preSort(papers, 60, 2026);
    expect(pool).toHaveLength(60);
    expect(pool[0].rank).toBe(0);
    expect(pool.slice(0, 4).every((p) => p.rank === 0)).toBe(true);
  });
});

describe("filters", () => {
  const known = {
    sourceKeys: new Set(["doi:10.5555/in.project", "s2:already-s2"]),
    sourceTitles: new Set(["fixture paper already added as a source"]),
    feedback: new Map([
      ["doi:10.5555/rejected", "not_relevant"],
      ["oa:W77", "added"],
    ]),
  };
  const abs = "A sufficiently long fixture abstract that describes what this made-up paper studies.";

  it("removes papers already in the project, already decided, or without an abstract", () => {
    const log = silentLog();
    const papers = [
      { title: "Keep me", ids: { doi: "10.5555/new" }, abstract: abs },
      { title: "In project by DOI", ids: { doi: "10.5555/in.project" }, abstract: abs },
      { title: "In project by S2 id", ids: { s2Id: "already-s2", doi: "10.5555/other" }, abstract: abs },
      { title: "Fixture Paper Already Added as a Source!", ids: {}, abstract: abs },
      { title: "Rejected before", ids: { doi: "10.5555/rejected" }, abstract: abs },
      { title: "Added from a batch", ids: { openAlexId: "W77" }, abstract: abs },
      { title: "No abstract", ids: { doi: "10.5555/noabs" }, abstract: null },
    ];
    expect(filterKnown(papers, known, log).map((p) => p.title)).toEqual(["Keep me"]);
    expect(log.lines.map((l) => l.split(" ").pop())).toEqual([
      "already_in_project",
      "already_in_project",
      "already_in_project",
      "marked_not_relevant",
      "already_added",
      "no_abstract",
    ]);
  });

  it("hard exclusions remove close papers only", () => {
    const log = silentLog();
    const papers = [
      { title: "RDF triple stores", embedding: v(1, 0.1, 0) },
      { title: "Property graphs", embedding: v(0, 1, 0) },
    ];
    const kept = filterHardExclusions(papers, [{ concept: "RDF/SPARQL", embedding: v(1, 0, 0) }], log);
    expect(kept.map((p) => p.title)).toEqual(["Property graphs"]);
    expect(log.lines[0]).toMatch(/hard_exclusion\(RDF\/SPARQL\)/);
  });

  it("allKeys lists every id form", () => {
    expect(allKeys({ doi: "10.1/a", arxivId: "2101.1", s2Id: "s", openAlexId: "W1" })).toEqual(["doi:10.1/a", "arxiv:2101.1", "s2:s", "oa:W1"]);
  });
});
