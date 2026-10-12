import { describe, it, expect } from "vitest";
import { buildMarkdown } from "../../src/services/export/markdown.js";

// Generated fixtures only.
const project = { name: "Fixture project", goal: "Check the fixture claims", topics: ["graphs", "storage"] };
const claims = [
  { _id: "c2", humanId: "C2", text: "Second fixture claim", status: "open", provisionalStatus: "open", gaps: [] },
  { _id: "c10", humanId: "C10", text: "Tenth fixture claim", status: "open", provisionalStatus: "open", gaps: [] },
  {
    _id: "c1",
    humanId: "C1",
    text: "First fixture claim",
    status: "contested",
    provisionalStatus: "contested",
    scopeNote: "read-heavy workloads",
    gaps: [{ type: "interested_party_only" }, { type: "single_source" }],
  },
];
const src = { title: "Fixture vendor post" };
const links = [
  { humanId: "L-1", claimId: "c1", stance: "supports", status: "confirmed", quote: "Generated supporting sentence.", passage: { humanId: "P-1", page: 2 }, source: src },
  { humanId: "L-2", claimId: "c1", stance: "contradicts", status: "confirmed", quote: "Generated contradicting sentence.", scope: "writes", passage: { humanId: "P-7" }, source: { title: "Fixture survey" } },
  { humanId: "L-3", claimId: "c1", stance: "supports", status: "ai_suggested", quote: "# Generated suggestion.", passage: { humanId: "P-2" }, source: src },
  { humanId: "L-4", claimId: "c2", stance: "inconclusive", status: "disputed", quote: "Generated disputed sentence.", passage: { humanId: "P-3" }, source: src },
  { humanId: "L-5", claimId: "c2", stance: "supports", status: "rejected", quote: "Rejected sentence.", passage: { humanId: "P-4" }, source: src },
];
const sources = [
  { kind: "url", status: "ready", title: "Fixture vendor post", url: "https://example.com/post", sourceType: "vendor", depth: "full_text", retrievedAt: new Date("2026-01-02T03:04:05Z"), textHash: "abc123" },
  { kind: "paper", status: "ready", title: "Fixture survey", authors: ["A One", "B Two", "C Three", "D Four"], year: 2021, ids: { doi: "10.5555/fixture-002" }, sourceType: "peer_reviewed", depth: "abstract_only", retrievedAt: new Date("2026-01-03T00:00:00Z") },
  { kind: "url", status: "failed", title: "Not ready", url: "https://example.com/x" },
];

describe("markdown export", () => {
  const md = buildMarkdown({ project, claims, links, sources, exportedAt: new Date("2026-02-03T04:05:06Z") });

  it("matches the snapshot", () => {
    expect(md).toMatchSnapshot();
  });

  it("orders claims numerically, lists only confirmed evidence under claims, and never rejected links", () => {
    expect(md.indexOf("### C1:")).toBeLessThan(md.indexOf("### C2:"));
    expect(md.indexOf("### C2:")).toBeLessThan(md.indexOf("### C10:"));
    const c1 = md.slice(md.indexOf("### C1:"), md.indexOf("### C2:"));
    expect(c1).toContain("> Generated supporting sentence.");
    expect(c1).toContain("— *Fixture vendor post*, p. 2 (P-1, L-1)");
    expect(c1).toContain("scope: writes");
    expect(c1).not.toContain("Generated suggestion");
    expect(md).not.toContain("Rejected sentence");
    // Text that would start a heading inside a blockquote is escaped
    expect(buildMarkdown({ project, claims: [claims[2]], links: [{ ...links[0], quote: "# Not a heading" }], sources: [] })).toContain("> \\# Not a heading");
  });

  it("lists provisional links, gaps and source provenance", () => {
    const provisional = md.slice(md.indexOf("## Still provisional"), md.indexOf("## Open evidence gaps"));
    expect(provisional).toContain('**C1** supports, AI-suggested: "# Generated suggestion."');
    expect(provisional).toContain("**C2** inconclusive, disputed");
    expect(md).toContain("- **C1** First fixture claim: Only supported by interested parties (e.g. vendors); Single source");
    expect(md).toContain("DOI: https://doi.org/10.5555/fixture-002");
    expect(md).toContain("A One, B Two, C Three et al.");
    expect(md).toContain("Retrieved: 2026-01-02");
    expect(md).toContain("`abc123`");
    expect(md).not.toContain("Not ready");
  });
});
