import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { drain, enqueueCoalesced } from "../../src/jobs/runner.js";
import { InterestProfile } from "../../src/models/InterestProfile.js";
import { Source } from "../../src/models/Source.js";
import { Passage } from "../../src/models/Passage.js";
import { Claim } from "../../src/models/Claim.js";
import { EvidenceLink } from "../../src/models/EvidenceLink.js";
import { embedOne, embedTexts } from "../../src/services/ai/embeddings.js";
import { recordQuestion, recomputeProfileVector, addFeedbackRule } from "../../src/services/profile/profileService.js";
import { recomputeClaimStatus } from "../../src/services/evidence/claimStatus.js";
import { cosine } from "../../src/utils/vectors.js";

const app = createApp();

async function setup(body = { name: "Profile test", topics: ["graph databases", "query performance"] }) {
  const owner = await registerAndLogin(app);
  const res = await request(app).post("/api/projects").set(owner.auth).send(body);
  await drain();
  const projectId = new mongoose.Types.ObjectId(res.body.project.id);
  return { owner, projectId, userId: new mongoose.Types.ObjectId(owner.user.id), base: `/api/projects/${projectId}` };
}
const vectorOf = async (projectId, userId) => (await InterestProfile.findOne({ projectId, userId }).select("+vector").lean()).vector;

describe("interest profile", () => {
  useTestDb();

  it("is created with the project and gets an initial vector from the topics", async () => {
    const { projectId, userId } = await setup();
    const v = await vectorOf(projectId, userId);
    expect(v).toHaveLength(768);
    expect(cosine(v, await embedOne("graph databases, query performance"))).toBeCloseTo(1, 5);
  });

  it("question drift moves the vector toward the questions", async () => {
    const { projectId, userId } = await setup();
    const question = "how does write-ahead logging affect recovery time";
    const qVec = await embedOne(question, "SEMANTIC_SIMILARITY");
    const before = cosine(await vectorOf(projectId, userId), qVec);
    await recordQuestion(projectId, userId, question, qVec);
    await drain();
    const after1 = cosine(await vectorOf(projectId, userId), qVec);
    expect(after1).toBeGreaterThan(before);
    await recordQuestion(projectId, userId, "write-ahead logging recovery benchmarks", await embedOne("write-ahead logging recovery benchmarks"));
    await drain();
    expect(cosine(await vectorOf(projectId, userId), qVec)).toBeGreaterThan(before);
    const p = await InterestProfile.findOne({ projectId, userId }).lean();
    expect(p.questionHistory.map((q) => q.text)).toEqual([question, "write-ahead logging recovery benchmarks"]);
  });

  it("includes the project's passages once sources exist", async () => {
    const { owner, projectId, userId } = await setup({ name: "No topics" });
    expect(await vectorOf(projectId, userId)).toEqual([]); // nothing to go on yet
    const source = await Source.create({ projectId, addedBy: owner.user.id, kind: "url", status: "ready" });
    const texts = ["columnar storage compresses analytical data", "vectorized execution speeds up scans"];
    const vecs = await embedTexts(texts);
    await Passage.create(texts.map((text, i) => ({ projectId, sourceId: source._id, humanId: `P-${i + 1}`, text, charStart: 0, charEnd: 1, embedding: vecs[i] })));
    await recomputeProfileVector(projectId, userId);
    const v = await vectorOf(projectId, userId);
    expect(cosine(v, vecs[0])).toBeGreaterThan(0.3);
  });

  it("topic changes and new members get profiles recomputed", async () => {
    const { owner, projectId, userId, base } = await setup();
    await request(app).patch(base).set(owner.auth).send({ topics: ["stream processing"] });
    await drain();
    expect(cosine(await vectorOf(projectId, userId), await embedOne("stream processing"))).toBeCloseTo(1, 5);
    const member = await registerAndLogin(app);
    await request(app).post(`${base}/members`).set(owner.auth).send({ email: member.user.email, role: "editor" });
    await drain();
    expect(await vectorOf(projectId, new mongoose.Types.ObjectId(member.user.id))).toHaveLength(768);
  });

  it("feedback reasons become exclusion rules (mock), deduplicated by concept", async () => {
    const { projectId, userId } = await setup();
    const rule = await addFeedbackRule(projectId, userId, { paperTitle: "Fixture Paper R", reason: "RDF/SPARQL is out of scope" });
    expect(rule).toMatchObject({ concept: "RDF/SPARQL is out of scope", strength: "soft", id: expect.any(String) });
    await addFeedbackRule(projectId, userId, { paperTitle: "Fixture Paper S", reason: "RDF/SPARQL is out of scope" });
    expect(await addFeedbackRule(projectId, userId, { paperTitle: "x", reason: "meh" })).toBeNull();
    const p = await InterestProfile.findOne({ projectId, userId }).select("+exclusions.embedding").lean();
    expect(p.exclusions).toHaveLength(1);
    expect(p.exclusions[0].embedding).toHaveLength(768);
  });

  it("GET/PATCH /profile shows themes and manages exclusions, per user", async () => {
    const { owner, projectId, userId, base } = await setup();
    await recordQuestion(projectId, userId, "first question about indexes");
    await recordQuestion(projectId, userId, "second question about caching");
    const rule = await addFeedbackRule(projectId, userId, { paperTitle: "Fixture", reason: "Not about OLAP cubes" });
    await drain();

    const res = await request(app).get(`${base}/profile`).set(owner.auth);
    expect(res.body.profile).toMatchObject({
      topics: ["graph databases", "query performance"],
      level: "intermediate",
      questionCount: 2,
      recentThemes: [{ text: "second question about caching" }, { text: "first question about indexes" }],
      exclusions: [{ id: rule.id, concept: "Not about OLAP cubes", strength: "soft" }],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/vector|embedding/);

    const hard = await request(app).patch(`${base}/profile`).set(owner.auth).send({ exclusion: { id: rule.id, strength: "hard" } });
    expect(hard.body.profile.exclusions[0].strength).toBe("hard");
    const removed = await request(app).patch(`${base}/profile`).set(owner.auth).send({ removeExclusion: rule.id });
    expect(removed.body.profile.exclusions).toEqual([]);
    expect((await request(app).patch(`${base}/profile`).set(owner.auth).send({ removeExclusion: rule.id })).status).toBe(404);

    const viewer = await registerAndLogin(app);
    await request(app).post(`${base}/members`).set(owner.auth).send({ email: viewer.user.email, role: "viewer" });
    const theirs = await request(app).get(`${base}/profile`).set(viewer.auth);
    expect(theirs.body.profile).toMatchObject({ questionCount: 0, exclusions: [] }); // profiles are per user
  });
});

describe("gaps on claims", () => {
  useTestDb();

  it("recomputing claim status stores the detected gaps", async () => {
    const { owner, projectId } = await setup();
    const vendor = await Source.create({ projectId, addedBy: owner.user.id, kind: "url", status: "ready", sourceType: "vendor", year: 2024 });
    const passage = await Passage.create({ projectId, sourceId: vendor._id, humanId: "P-1", text: "x", charStart: 0, charEnd: 1 });
    const claim = await Claim.create({ projectId, humanId: "C1", text: "Fixture claim text", origin: "user" });
    await EvidenceLink.create({ projectId, claimId: claim._id, passageId: passage._id, sourceId: vendor._id, stance: "supports" });
    await recomputeClaimStatus(claim._id);
    const saved = await Claim.findById(claim._id).lean();
    expect(saved.gaps.map((g) => g.type).sort()).toEqual(["interested_party_only", "single_source", "unchallenged"]);
    expect(saved.gaps[0].queryHint).toMatch(/^Fixture claim text /);
  });
});

describe("enqueueCoalesced", () => {
  it("runs once more if requested while running, collapsing repeated requests", async () => {
    let runs = 0;
    let started, release;
    const startedP = new Promise((r) => (started = r));
    const gate = new Promise((r) => (release = r));
    const job = async () => {
      runs++;
      if (runs === 1) {
        started();
        await gate;
      }
    };
    enqueueCoalesced("t", job);
    await startedP; // first run is in progress
    enqueueCoalesced("t", job);
    enqueueCoalesced("t", job);
    release();
    await drain();
    expect(runs).toBe(2);
  });

  it("a request made before the job starts is covered by that run", async () => {
    let runs = 0;
    const job = async () => runs++;
    enqueueCoalesced("u", job);
    enqueueCoalesced("u", job);
    await drain();
    expect(runs).toBe(1);
  });
});
