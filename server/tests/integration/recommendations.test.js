import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { drain } from "../../src/jobs/runner.js";
import { RecommendationBatch } from "../../src/models/RecommendationBatch.js";
import { Feedback } from "../../src/models/Feedback.js";
import { Source } from "../../src/models/Source.js";
import { Claim } from "../../src/models/Claim.js";
import { InterestProfile } from "../../src/models/InterestProfile.js";
import { runRecommendation, maybeOnboard, failInterruptedBatches } from "../../src/services/recommender/pipeline.js";

// ---- Made-up papers. Every external lookup below is mocked (tests never call real APIs).
const NOW = new Date().getFullYear();
const abstract = (topic) =>
  `This fixture study examines ${topic} in a synthetic setting. It reports made-up measurements for automated tests only.`;
const P = (id, title, year, citations, extra = {}) => ({
  ids: { s2Id: `s2-${id}`, doi: `10.5555/fx.${id}` },
  title, authors: [`Author ${id.toUpperCase()}`], year, venue: `Venue ${id}`,
  abstract: abstract(title.toLowerCase()), citationCount: citations, oaPdfUrl: null, url: `https://example.org/${id}`,
  providers: ["s2"], ...extra,
});
const PAPERS = [
  P("a", "Graph Query Engines Compared", NOW - 3, 300),
  P("b", "Graph Database Storage Layouts", NOW - 4, 200),
  P("c", "Foundations of Graph Data Management", NOW - 12, 3000),
  P("d", "Recent Advances in Graph Query Optimisation", NOW - 1, 40),
  P("e", "Graph Systems Under Memory Pressure", NOW - 5, 120),
  P("m", "Mismatched Graph Paper", NOW - 2, 500), // Crossref says a different title → L2 drop
  P("f", "Graph Analytics at Scale", NOW - 6, 90),
  P("g", "Graph Indexing Techniques", NOW - 7, 80),
];
const byDoi = new Map(PAPERS.map((p) => [p.ids.doi, p]));
const ctl = vi.hoisted(() => ({ rationaleFails: new Set(), hide: new Set() }));

vi.mock("../../src/services/scholarly/semanticScholar.js", async (orig) => ({
  ...(await orig()),
  searchS2: async () => PAPERS.filter((p) => !ctl.hide.has(p.title)).map((p) => structuredClone(p)),
  getS2Paper: async (id) => {
    const p = PAPERS.find((x) => x.ids.s2Id === id || `DOI:${x.ids.doi}` === id);
    return p ? { ...structuredClone(p), providers: ["s2"] } : null;
  },
}));
vi.mock("../../src/services/scholarly/openAlex.js", async (orig) => ({
  ...(await orig()),
  searchOpenAlex: async () => [],
  getOpenAlexByDoi: async (doi) => {
    const p = byDoi.get(doi);
    return p ? { ...structuredClone(p), ids: { openAlexId: `W-${doi}`, doi }, providers: ["openalex"] } : null;
  },
}));
vi.mock("../../src/services/scholarly/crossref.js", () => ({
  getCrossref: async (doi) => {
    const p = byDoi.get(doi);
    if (!p) return null;
    const title = p.title === "Mismatched Graph Paper" ? "A Completely Unrelated Paper on Compilers" : p.title;
    return { ...structuredClone(p), title, ids: { doi }, providers: ["crossref"] };
  },
}));
vi.mock("../../src/services/scholarly/graph.js", () => ({ getReferences: async () => [], getCitations: async () => [] }));
vi.mock("../../src/services/ai/prompts/rationale.js", async (orig) => {
  const real = await orig();
  return {
    ...real,
    mock: (input) => (ctl.rationaleFails.has(input.paper.title) ? { rationale: "Sounds relevant to you.", abstractQuote: "This sentence is not in the abstract at all." } : real.mock(input)),
  };
});

const app = createApp();

async function setup() {
  const owner = await registerAndLogin(app);
  const { body } = await request(app).post("/api/projects").set(owner.auth).send({ name: "Recs", topics: ["graph databases"] });
  await drain();
  const projectId = new mongoose.Types.ObjectId(body.project.id);
  const userId = new mongoose.Types.ObjectId(owner.user.id);
  await Claim.create({ projectId, humanId: "C1", text: "Graph engines answer multi-hop queries faster", origin: "user", status: "supported", provisionalStatus: "supported" });
  return { owner, projectId, userId, base: `/api/projects/${projectId}/recommendations` };
}

describe("recommendation pipeline (AI mock, mocked scholarly APIs)", () => {
  useTestDb();
  beforeEach(() => {
    ctl.rationaleFails.clear();
    ctl.hide.clear();
  });

  it("produces ≤ 5 verified, grounded items in distinct slots, and logs the L2 drop", async () => {
    const { projectId, userId } = await setup();
    const batch = await runRecommendation({ projectId, userId, trigger: "manual" });
    expect(batch.status).toBe("ready");
    expect(batch.humanId).toBe("B1");
    expect(batch.items.length).toBeGreaterThan(0);
    expect(batch.items.length).toBeLessThanOrEqual(5);
    expect(new Set(batch.items.map((i) => i.slot)).size).toBe(batch.items.length);
    for (const item of batch.items) {
      expect(item.groundingPassed).toBe(true);
      expect(item.verifiedIds.length).toBeGreaterThan(0);
      expect(item.paper.abstract).toContain(item.rationaleQuote); // L3: real abstract text
      expect(item.rationale.length).toBeGreaterThan(10);
    }
    expect(batch.items.map((i) => i.paper.title)).not.toContain("Mismatched Graph Paper");
    const log = batch.pipelineLog.join("\n");
    expect(log).toMatch(/L2 drop  "Mismatched Graph Paper" .* reason=title_mismatch/);
    expect(log).toMatch(/ready verified=\d\/5/);

    const slots = Object.fromEntries(batch.items.map((i) => [i.slot, i]));
    expect(slots.FOUNDATION?.paper.title).toBe("Foundations of Graph Data Management");
    expect(slots.FRONTIER?.paper.year).toBeGreaterThanOrEqual(NOW - 2);
    // the only challenger found was the mismatched paper: it's never shown; the slot falls back with a note
    expect(log).toMatch(/L3 pass  challenger "Mismatched Graph Paper" .* qualifies C1/);
    expect(slots.CHALLENGER).toMatchObject({ gapTargets: [], slotNote: expect.stringMatching(/No paper challenging/) });
  });

  it("a verified challenger fills the CHALLENGER slot and targets the claim it qualifies", async () => {
    const { projectId, userId } = await setup();
    ctl.hide.add("Mismatched Graph Paper");
    const batch = await runRecommendation({ projectId, userId, trigger: "manual" });
    expect(batch.items).toHaveLength(5);
    const challenger = batch.items.find((i) => i.slot === "CHALLENGER");
    expect(challenger.slotNote).toBeNull();
    expect(challenger.gapTargets[0]).toMatchObject({ humanId: "C1", gapType: "qualifies" });
  });

  it("replaces a paper whose rationale quote isn't in its abstract (L3)", async () => {
    const { projectId, userId } = await setup();
    ctl.rationaleFails.add("Foundations of Graph Data Management");
    const batch = await runRecommendation({ projectId, userId, trigger: "manual" });
    expect(batch.items.map((i) => i.paper.title)).not.toContain("Foundations of Graph Data Management");
    const log = batch.pipelineLog.join("\n");
    expect(log).toMatch(/L3 retry "Foundations of Graph Data Management"/);
    expect(log).toMatch(/L3 drop  "Foundations of Graph Data Management"/);
    expect(batch.items.find((i) => i.slot === "FOUNDATION").slotNote).toMatch(/No strong older work/);
  });

  it("onboarding runs once per project; interrupted batches are failed at boot", async () => {
    const { projectId, userId } = await setup();
    await maybeOnboard(projectId, userId);
    await drain();
    await maybeOnboard(projectId, userId);
    await drain();
    const batches = await RecommendationBatch.find({ projectId }).lean();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ trigger: "onboarding", status: "ready" });

    const old = new Date(Date.now() - 11 * 60_000);
    await RecommendationBatch.create({ projectId, userId, humanId: "B9", trigger: "manual", status: "running", createdAt: old, updatedAt: old });
    await RecommendationBatch.create({ projectId, userId, humanId: "B10", trigger: "manual", status: "running" });
    await failInterruptedBatches();
    expect(await RecommendationBatch.findOne({ humanId: "B9" }).lean()).toMatchObject({ status: "failed", error: expect.stringMatching(/Interrupted/) });
    expect(await RecommendationBatch.findOne({ humanId: "B10" }).lean()).toMatchObject({ status: "running" }); // may still be running elsewhere
  });
});

describe("recommendation routes", () => {
  useTestDb();
  beforeEach(() => {
    ctl.rationaleFails.clear();
    ctl.hide.clear();
  });

  async function readyBatch() {
    const s = await setup();
    const res = await request(app).post(s.base).set(s.owner.auth).send({});
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ batchId: expect.any(String), humanId: "B1" });
    await drain();
    const latest = await request(app).get(`${s.base}/latest`).set(s.owner.auth);
    expect(latest.body.batch).toMatchObject({ id: res.body.batchId, status: "ready" });
    return { ...s, batch: latest.body.batch };
  }

  it("POST rejects a second run while one is running (409); GET is per user", async () => {
    const { owner, base, projectId, userId, batch } = await readyBatch();
    await RecommendationBatch.create({ projectId, userId, humanId: "B7", trigger: "manual", status: "running" });
    const busy = await request(app).post(base).set(owner.auth).send({});
    expect(busy.status).toBe(409);
    expect(busy.body.error).toMatch(/B7 is still running/);

    const got = await request(app).get(`${base}/${batch.id}`).set(owner.auth);
    expect(got.body.batch.pipelineLog.length).toBeGreaterThan(3);
    const member = await registerAndLogin(app);
    await request(app).post(`/api/projects/${projectId}/members`).set(owner.auth).send({ email: member.user.email, role: "editor" });
    expect((await request(app).get(`${base}/${batch.id}`).set(member.auth)).status).toBe(404);
    expect((await request(app).get(`${base}/latest`).set(member.auth)).body.batch).toBeNull();
  });

  it("'added' creates an abstract-only paper source that ingests, and can't be added twice", async () => {
    const { owner, base, projectId, batch } = await readyBatch();
    const url = `${base}/${batch.id}/items/0/feedback`;
    const res = await request(app).post(url).set(owner.auth).send({ action: "added" });
    expect(res.status).toBe(200);
    expect(res.body.source).toMatchObject({ kind: "paper", depth: "abstract_only", sourceType: "peer_reviewed", title: batch.items[0].paper.title });
    expect(res.body.item.feedback).toMatchObject({ action: "added" });
    await drain();
    const source = await Source.findById(res.body.source.id).lean();
    expect(source.status).toBe("ready");
    expect(await Feedback.countDocuments({ projectId, action: "added" })).toBe(1);
    expect((await request(app).post(url).set(owner.auth).send({ action: "added" })).status).toBe(409);
  });

  it("'not_relevant' with a reason adds an exclusion rule and replaces the card", async () => {
    const { owner, base, projectId, userId, batch } = await readyBatch();
    const before = batch.items.map((i) => i.paper.title);
    const res = await request(app)
      .post(`${base}/${batch.id}/items/1/feedback`)
      .set(owner.auth)
      .send({ action: "not_relevant", reason: "Not interested in storage layouts" });
    expect(res.status).toBe(200);
    expect(res.body.rule).toMatchObject({ concept: "Not interested in storage layouts", strength: "soft" });
    expect(res.body.replaced).toBe(true);
    expect(before).not.toContain(res.body.item.paper.title);
    expect(res.body.item).toMatchObject({ slot: batch.items[1].slot, groundingPassed: true });
    expect(res.body.batch.items[1].paper.title).toBe(res.body.item.paper.title);
    const profile = await InterestProfile.findOne({ projectId, userId }).lean();
    expect(profile.exclusions).toHaveLength(1);

    // the rejected paper never comes back
    const next = await runRecommendation({ projectId, userId, trigger: "manual" });
    expect(next.items.map((i) => i.paper.title)).not.toContain(before[1]);
  });

  it("'read' and 'later' just record feedback; bad input is rejected", async () => {
    const { owner, base, batch } = await readyBatch();
    const read = await request(app).post(`${base}/${batch.id}/items/2/feedback`).set(owner.auth).send({ action: "read" });
    expect(read.body).toMatchObject({ source: null, rule: null, replaced: null, item: { feedback: { action: "read" } } });
    expect((await request(app).post(`${base}/${batch.id}/items/9/feedback`).set(owner.auth).send({ action: "read" })).status).toBe(400);
    expect((await request(app).post(`${base}/${batch.id}/items/0/feedback`).set(owner.auth).send({ action: "love" })).status).toBe(400);
  });
});
