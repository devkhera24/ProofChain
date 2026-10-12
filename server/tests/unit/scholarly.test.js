import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { useTestDb } from "../helpers/db.js";
import { PaperCache } from "../../src/models/PaperCache.js";
import { getJson } from "../../src/services/scholarly/http.js";
import { normDoi, paperKey, stripTags } from "../../src/services/scholarly/paper.js";
import { fromS2, searchS2, getS2Paper, s2Available, __resetS2Cooldown } from "../../src/services/scholarly/semanticScholar.js";
import { fromOpenAlex, abstractFromInverted, searchOpenAlex } from "../../src/services/scholarly/openAlex.js";
import { fromCrossref, getCrossref } from "../../src/services/scholarly/crossref.js";
import { fromUnpaywall } from "../../src/services/scholarly/unpaywall.js";
import { mergePapers } from "../../src/services/scholarly/merge.js";
import { verifyPaper } from "../../src/services/scholarly/verify.js";
import { getReferences } from "../../src/services/scholarly/graph.js";
import { createPipelineLog } from "../../src/services/validation/pipelineLog.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/scholarly/${name}.json`, import.meta.url), "utf8"));
const json = (body, status = 200, headers = {}) => new Response(body === null ? "" : JSON.stringify(body), { status, headers });

/** Route fetch calls by URL substring → response (or a function returning one). Unmatched → 404. */
function mockFetch(routes) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const hit = Object.entries(routes).find(([part]) => String(url).includes(part));
    if (!hit) return json(null, 404);
    return typeof hit[1] === "function" ? hit[1](url) : hit[1].clone();
  });
}

describe("paper helpers and mappers", () => {
  it("normalises DOIs and builds stable keys", () => {
    expect(normDoi("https://doi.org/10.5555/ABC")).toBe("10.5555/abc");
    expect(normDoi("doi:10.5555/X ")).toBe("10.5555/x");
    expect(normDoi(null)).toBeUndefined();
    expect(paperKey({ ids: { doi: "10.1/a", s2Id: "x" } })).toBe("doi:10.1/a");
    expect(paperKey({ ids: { arxivId: "2101.1" } })).toBe("arxiv:2101.1");
    expect(paperKey({ ids: { s2Id: "x" } })).toBe("s2:x");
    expect(paperKey({ ids: { openAlexId: "W1" } })).toBe("oa:W1");
    expect(stripTags("<jats:p>Hello <i>there</i></jats:p>")).toBe("Hello there");
  });

  it("maps Semantic Scholar records", () => {
    const [a, b, none] = fixture("s2-search").data.map(fromS2);
    expect(a).toEqual({
      ids: { s2Id: "s2-fixture-a", doi: "10.5555/fixture.a", arxivId: undefined },
      title: "Fixture Paper A: Adjacency Layouts for Toy Graph Queries",
      authors: ["Ada Example", "Bo Sample"],
      year: 2021,
      venue: "Fixture Conference",
      abstract: "A fixture abstract used only in tests.",
      citationCount: 12,
      oaPdfUrl: "https://example.org/fixture-a.pdf",
      url: "https://www.semanticscholar.org/paper/s2-fixture-a",
      providers: ["s2"],
    });
    expect(b).toMatchObject({ ids: { arxivId: "1901.00001" }, venue: null, abstract: null, oaPdfUrl: null });
    expect(none).toBeNull();
  });

  it("maps OpenAlex records and rebuilds inverted abstracts", () => {
    expect(abstractFromInverted({ world: [1], hello: [0], again: [3], and: [2] })).toBe("hello world and again");
    expect(abstractFromInverted(null)).toBeNull();
    const [a, b] = fixture("openalex-search").results.map(fromOpenAlex);
    expect(a).toMatchObject({
      ids: { openAlexId: "W100", doi: "10.5555/fixture.a" },
      authors: ["Ada Example", "Bo Sample"],
      venue: "Fixture Conference Proceedings",
      abstract: "A longer fixture abstract from OpenAlex (the abstract wins).",
      citationCount: 15,
      oaPdfUrl: "https://example.org/oa/fixture-a",
      providers: ["openalex"],
    });
    expect(b.ids).toMatchObject({ openAlexId: "W200", arxivId: "1901.00001" });
    expect(fromOpenAlex({ id: "W1" })).toBeNull();
  });

  it("maps Crossref and Unpaywall records", () => {
    expect(fromCrossref(fixture("crossref-a").message)).toMatchObject({
      ids: { doi: "10.5555/fixture.a" },
      authors: ["Ada Example", "Bo Sample"],
      year: 2021,
      venue: "Fixture Conference",
      abstract: "A fixture abstract used only in tests.",
      providers: ["crossref"],
    });
    expect(fromCrossref({ title: [] })).toBeNull();
    expect(
      fromUnpaywall({ doi: "10.5555/X", title: "Fixture X", z_authors: [{ given: "Ada", family: "Example" }], year: 2020, best_oa_location: { url_for_pdf: "https://example.org/x.pdf" } }),
    ).toMatchObject({ ids: { doi: "10.5555/x" }, authors: ["Ada Example"], oaPdfUrl: "https://example.org/x.pdf" });
  });
});

describe("mergePapers", () => {
  const s2 = fixture("s2-search").data.map(fromS2).filter(Boolean);
  const oa = fixture("openalex-search").results.map(fromOpenAlex);

  it("merges by DOI and by arXiv id, unioning ids and providers and keeping the best fields", () => {
    const merged = mergePapers([...s2, ...oa]);
    expect(merged).toHaveLength(2);
    const [a, b] = merged;
    expect(a.ids).toEqual({ s2Id: "s2-fixture-a", doi: "10.5555/fixture.a", openAlexId: "W100" });
    expect(a.providers).toEqual(["s2", "openalex"]);
    expect(a.abstract).toMatch(/longer fixture abstract/); // longer abstract wins
    expect(a.citationCount).toBe(15);
    expect(a.venue).toBe("Fixture Conference"); // first non-empty kept
    expect(b.ids).toMatchObject({ s2Id: "s2-fixture-b", openAlexId: "W200", arxivId: "1901.00001" });
  });

  it("merges by title + first author when ids differ, even if only one record has a DOI", () => {
    const noDoi = { ...s2[0], ids: { s2Id: "s2-x" }, title: "fixture paper a: adjacency layouts for toy graph queries" };
    const withDoi = { ...oa[0] };
    const merged = mergePapers([noDoi, withDoi]);
    expect(merged).toHaveLength(1);
    expect(merged[0].ids).toMatchObject({ s2Id: "s2-x", doi: "10.5555/fixture.a", openAlexId: "W100" });
  });

  it("keeps different papers apart and doesn't mutate the input", () => {
    const input = [s2[0], s2[1]];
    const copy = JSON.parse(JSON.stringify(input));
    expect(mergePapers(input)).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(input))).toEqual(copy);
  });
});

describe("HTTP cache and clients", () => {
  useTestDb();
  beforeEach(() => __resetS2Cooldown());
  afterEach(() => vi.restoreAllMocks());

  it("returns the cached payload without calling fetch twice", async () => {
    const spy = mockFetch({ "api.openalex.org/works?search": json(fixture("openalex-search")) });
    const first = await searchOpenAlex("fixture", 5);
    const second = await searchOpenAlex("fixture", 5);
    expect(second).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await PaperCache.countDocuments()).toBe(1);
  });

  it("returns null on 404 and retries 5xx, honouring Retry-After", async () => {
    mockFetch({ "/missing": json({ message: "nope" }, 404) });
    expect(await getJson("test", "https://example.org/missing")).toBeNull();
    vi.restoreAllMocks();

    let n = 0;
    const spy = mockFetch({ "/flaky": () => (++n < 2 ? json(null, 503, { "retry-after": "0.01" }) : json({ ok: 1 })) });
    expect(await getJson("test", "https://example.org/flaky")).toEqual({ ok: 1 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("sends the Crossref polite-pool User-Agent", async () => {
    const spy = mockFetch({ "api.crossref.org/works/": json(fixture("crossref-a")) });
    expect(await getCrossref("10.5555/fixture.a")).toMatchObject({ title: "Fixture Paper A: Adjacency Layouts for Toy Graph Queries" });
    expect(spy.mock.calls[0][1].headers["User-Agent"]).toMatch(/^ProofChain\/1\.0 \(mailto:.+\)$/);
  });

  it("pauses Semantic Scholar for a while after a 429", async () => {
    const spy = mockFetch({ "api.semanticscholar.org": json({ message: "Too Many Requests" }, 429, { "retry-after": "0.01" }) });
    await expect(searchS2("fixture")).rejects.toMatchObject({ status: 429 });
    const calls = spy.mock.calls.length;
    expect(s2Available()).toBe(false);
    await expect(getS2Paper("s2-fixture-a")).rejects.toThrow(/skipped for now/);
    expect(spy.mock.calls.length).toBe(calls); // no network call during the cooldown
  });

  it("falls back to OpenAlex for references when Semantic Scholar is unavailable", async () => {
    mockFetch({
      "api.semanticscholar.org": json(null, 429, { "retry-after": "0.01" }),
      "select=referenced_works": json({ referenced_works: ["https://openalex.org/W100", "https://openalex.org/W200"] }),
      "filter=openalex:W100|W200": json(fixture("openalex-search")),
    });
    const refs = await getReferences({ s2Id: "s2-z", openAlexId: "W999" }, 5);
    expect(refs.map((p) => p.ids.openAlexId)).toEqual(["W100", "W200"]);
  });
});

describe("verifyPaper (L1 + L2)", () => {
  useTestDb();
  beforeEach(() => __resetS2Cooldown());
  afterEach(() => vi.restoreAllMocks());
  const candidate = () => fromS2(fixture("s2-search").data[0]); // came from S2, has a DOI

  it("passes when Crossref and OpenAlex agree", async () => {
    mockFetch({
      "api.crossref.org/works/": json(fixture("crossref-a")),
      "api.openalex.org/works/doi:": json(fixture("openalex-search").results[0]),
      "api.semanticscholar.org": json(fixture("s2-search").data[0]),
    });
    const log = createPipelineLog("t");
    expect(await verifyPaper(candidate(), log)).toEqual({ verified: true, verifiedIds: ["doi", "openalex", "s2"] });
    expect(log.lines[0]).toMatch(/L1\/L2 pass .*via doi\+openalex\+s2/);
  });

  it("fails with title_mismatch when the DOI resolves to a different paper", async () => {
    const other = fixture("crossref-a");
    other.message.title = ["An Entirely Different Fixture About Compilers"];
    mockFetch({ "api.crossref.org/works/": json(other) });
    const log = createPipelineLog("t");
    const r = await verifyPaper(candidate(), log);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/^title_mismatch\(0\.\d\d\)/);
    expect(log.lines[0]).toMatch(/L2 drop/);
  });

  it("fails with no_id_resolves when every lookup returns 404", async () => {
    mockFetch({});
    expect(await verifyPaper(candidate())).toMatchObject({ verified: false, verifiedIds: [], reason: "no_id_resolves" });
  });

  it("fails with no_resolvable_id when the paper has no usable id", async () => {
    expect(await verifyPaper({ title: "Fixture Without Ids", ids: {}, providers: ["openalex"], authors: [] })).toMatchObject({
      verified: false,
      reason: "no_resolvable_id",
    });
  });
});
