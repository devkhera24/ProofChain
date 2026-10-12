import { describe, it, expect } from "vitest";
import { detectGaps } from "../../src/services/evidence/gapDetector.js";

// The walkthrough, with made-up sources: a vendor blog post supports the claim twice.
const claim = { text: "Graph databases outperform relational databases on multi-hop queries" };
const vendorBlog = { _id: "src-vendor", sourceType: "vendor", depth: "full_text", year: 2024 };
const survey = { _id: "src-survey", sourceType: "peer_reviewed", depth: "full_text", year: 2023 };
const oldPaper = { _id: "src-old", sourceType: "peer_reviewed", depth: "full_text", year: 2010 };
const abstractOnly = { _id: "src-abs", sourceType: "peer_reviewed", depth: "abstract_only", year: 2022 };
const link = (source, stance, status = "ai_suggested") => ({ source, stance, status });
const types = (gaps) => gaps.map((g) => g.type).sort();

describe("detectGaps", () => {
  it("two passages from the same vendor blog → single_source, interested_party_only, unchallenged", () => {
    const gaps = detectGaps(claim, [link(vendorBlog, "supports"), link(vendorBlog, "supports", "confirmed")], 2026);
    expect(types(gaps)).toEqual(["interested_party_only", "single_source", "unchallenged"]);
    const ipo = gaps.find((g) => g.type === "interested_party_only");
    expect(ipo).toMatchObject({ weight: 0.9, queryHint: `${claim.text} independent benchmark peer-reviewed evaluation` });
    expect(ipo.detectedAt).toBeInstanceOf(Date);
  });

  it("a confirmed contradiction → contested, and no longer unchallenged", () => {
    const gaps = detectGaps(
      claim,
      [link(vendorBlog, "supports", "confirmed"), link(vendorBlog, "supports"), link(survey, "contradicts", "confirmed")],
      2026,
    );
    expect(types(gaps)).toEqual(["contested", "interested_party_only", "single_source"]);
  });

  it("an unconfirmed contradiction removes unchallenged but isn't contested yet", () => {
    const gaps = detectGaps(claim, [link(survey, "supports", "confirmed"), link(vendorBlog, "contradicts")], 2026);
    expect(types(gaps)).toEqual(["single_source"]);
  });

  it("an inconclusive link also counts as a challenge", () => {
    expect(types(detectGaps(claim, [link(survey, "supports"), link(vendorBlog, "inconclusive")], 2026))).toEqual(["single_source"]);
  });

  it("old-only support → stale", () => {
    const gaps = detectGaps(claim, [link(oldPaper, "supports"), link({ ...oldPaper, _id: "src-old-2", year: 2012 }, "supports")], 2026);
    expect(types(gaps)).toEqual(["stale", "unchallenged"]);
    expect(detectGaps(claim, [link(oldPaper, "supports"), link(survey, "supports")], 2026).some((g) => g.type === "stale")).toBe(false);
  });

  it("abstract-only support → abstract_only", () => {
    expect(types(detectGaps(claim, [link(abstractOnly, "supports"), link(survey, "contradicts")], 2026))).toEqual([
      "abstract_only",
      "single_source",
    ]);
  });

  it("independent peer-reviewed support from two sources that is challenged → no gaps", () => {
    const gaps = detectGaps(claim, [link(survey, "supports"), link(oldPaper, "supports"), link(vendorBlog, "inconclusive")], 2026);
    expect(gaps).toEqual([]);
  });

  it("no supporting evidence → no support-based gaps; links without a source are ignored", () => {
    expect(detectGaps(claim, [link(survey, "contradicts")], 2026)).toEqual([]);
    expect(detectGaps(claim, [{ stance: "supports", status: "confirmed", source: null }], 2026)).toEqual([]);
  });
});
