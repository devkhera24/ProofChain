import { describe, it, expect } from "vitest";
import { mmrPick, eligible, assignSlots, fillSlot } from "../../src/services/recommender/slots.js";
import { normalize } from "../../src/utils/vectors.js";

const Y = 2026;
const v = (...xs) => normalize(xs);
const paper = (key, score, embedding, extra = {}) => ({
  key, title: key, score, embedding, year: 2024, authors: [`${key} Author`], venue: `${key} Venue`,
  scoreBreakdown: { quality: 0.6 }, ...extra,
});
const ctx = (challengers = []) => ({ currentYear: Y, challengerKeys: new Set(challengers) });
const acceptAll = async () => true;

describe("mmrPick", () => {
  it("doesn't pick two near-identical high scorers when a diverse alternative exists", () => {
    const a = paper("A", 0.9, v(1, 0, 0));
    const a2 = paper("A-twin", 0.89, v(1, 0.01, 0));
    const b = paper("B", 0.8, v(0, 1, 0));
    expect(mmrPick([a, a2, b], [])).toBe(a);
    expect(mmrPick([a2, b], [a])).toBe(b);
  });
});

describe("eligible", () => {
  it("applies the slot rules", () => {
    expect(eligible("FOUNDATION", paper("old", 1, [], { year: 2015 }), ctx())).toBe(true);
    expect(eligible("FOUNDATION", paper("old-weak", 1, [], { year: 2015, scoreBreakdown: { quality: 0.2 } }), ctx())).toBe(false);
    expect(eligible("FOUNDATION", paper("new", 1, [], { year: 2023 }), ctx())).toBe(false);
    expect(eligible("FRONTIER", paper("new", 1, [], { year: 2024 }), ctx())).toBe(true);
    expect(eligible("FRONTIER", paper("nodate", 1, [], { year: null }), ctx())).toBe(false);
    expect(eligible("CHALLENGER", paper("X", 1, []), ctx(["X"]))).toBe(true);
    expect(eligible("CHALLENGER", paper("Y", 1, []), ctx(["X"]))).toBe(false);
    expect(eligible("CORE", paper("any", 1, []), ctx())).toBe(true);
  });
});

describe("assignSlots", () => {
  const ranked = [
    paper("core-1", 0.9, v(1, 0, 0, 0, 0), { year: 2022 }),
    paper("core-1-sameauthor", 0.88, v(0.9, 0.3, 0, 0, 0), { year: 2022, authors: ["core-1 Author"] }),
    paper("core-2", 0.85, v(0, 1, 0, 0, 0), { year: 2021 }),
    paper("old", 0.7, v(0, 0, 1, 0, 0), { year: 2012 }),
    paper("recent", 0.6, v(0, 0, 0, 1, 0), { year: 2025 }),
    paper("challenger", 0.5, v(0, 0, 0, 0, 1), { year: 2020 }),
  ];

  it("fills all five slots with distinct papers in display order", async () => {
    const items = await assignSlots(ranked, ctx(["challenger"]), acceptAll);
    expect(items.map((i) => [i.slot, i.paper.key])).toEqual([
      ["CORE", "core-1"],
      ["CORE_2", "core-2"], // different first authors and venue than CORE
      ["FOUNDATION", "old"],
      ["FRONTIER", "recent"],
      ["CHALLENGER", "challenger"],
    ]);
    expect(new Set(items.map((i) => i.paper.key)).size).toBe(5);
    expect(items.every((i) => i.slotNote === null)).toBe(true);
  });

  it("falls back with a note when a strict slot has no eligible paper", async () => {
    const items = await assignSlots(ranked.filter((p) => p.key !== "old"), ctx([]), acceptAll);
    const challenger = items.find((i) => i.slot === "CHALLENGER");
    expect(challenger.slotNote).toMatch(/No paper challenging your claims/);
    expect(items.find((i) => i.slot === "FOUNDATION").slotNote).toMatch(/No strong older work/);
  });

  it("skips papers that fail acceptance, falls back with a note, and never pads", async () => {
    const accept = async (p) => !["challenger", "old"].includes(p.key);
    const pool = ranked.filter((p) => p.key !== "recent"); // 5 papers, 2 of which fail
    const items = await assignSlots(pool, ctx(["challenger"]), accept);
    const keys = items.map((i) => i.paper.key);
    expect(keys).not.toContain("challenger");
    expect(keys).not.toContain("old");
    expect(items).toHaveLength(3); // only 3 papers pass: no padding with failed ones
    expect(items.find((i) => i.slot === "CHALLENGER")?.slotNote ?? items.find((i) => i.slotNote)?.slotNote).toMatch(/showing another core paper/);
  });

  it("fillSlot refills one slot while excluding used papers", async () => {
    const state = { used: new Set(["core-1", "core-2"]), selected: [], picks: {} };
    const pick = await fillSlot("CORE", ranked, ctx(), acceptAll, state);
    expect(pick.paper.key).toBe("core-1-sameauthor");
  });
});
