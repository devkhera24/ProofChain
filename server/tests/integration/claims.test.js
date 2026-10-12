import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { makePdf } from "../helpers/pdf.js";
import { drain } from "../../src/jobs/runner.js";
import { Claim } from "../../src/models/Claim.js";
import { Passage } from "../../src/models/Passage.js";
import { EvidenceLink } from "../../src/models/EvidenceLink.js";
import { AuditEvent } from "../../src/models/AuditEvent.js";
import { extractClaimsFromSource, spreadSample } from "../../src/services/claims/claimService.js";

// Lets a test replace the extractClaims mock output (e.g. with a fabricated quote)
const override = vi.hoisted(() => ({ mock: null }));
vi.mock("../../src/services/ai/prompts/extractClaims.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, mock: (input) => (override.mock ?? real.mock)(input) };
});

const app = createApp();
// Generated text only — no real papers or quotes
const line = (n, topic) => `Statement ${n} reports that ${topic} reduces latency for workloads of type ${n}.`;
const pdfFor = (topic) =>
  makePdf([[[line(1, topic), line(2, topic)], [line(3, topic), line(4, topic)]], [[line(5, topic), line(6, topic)]]], {
    title: `Notes on ${topic}`,
  });

async function setup() {
  const owner = await registerAndLogin(app);
  const { body } = await request(app).post("/api/projects").set(owner.auth).send({ name: "Claims test", topics: ["latency"] });
  const projectId = body.project.id;
  return { owner, projectId, base: `/api/projects/${projectId}/claims` };
}
async function ingest(owner, projectId, topic = "caching") {
  const { body } = await request(app)
    .post(`/api/projects/${projectId}/sources/upload`)
    .set(owner.auth)
    .attach("file", await pdfFor(topic), { filename: `${topic}.pdf`, contentType: "application/pdf" });
  await drain(); // ingestion, then the claim extraction job it enqueues
  return body.source.id;
}

describe("claim extraction (AI mock)", () => {
  useTestDb();
  beforeEach(() => (override.mock = null));

  it("creates C-numbered claims, each with one ai_suggested link whose quote is real passage text", async () => {
    const { owner, projectId } = await setup();
    const sourceId = await ingest(owner, projectId);

    const claims = await Claim.find({ projectId }).sort({ humanId: 1 }).lean();
    expect(claims.map((c) => c.humanId)).toEqual(["C1", "C2"]);
    expect(claims.every((c) => c.origin === "ai_from_source")).toBe(true);
    for (const claim of claims) {
      const links = await EvidenceLink.find({ claimId: claim._id }).lean();
      expect(links).toHaveLength(1);
      const [link] = links;
      expect(link).toMatchObject({ stance: "supports", status: "ai_suggested", origin: "ai", matchType: "exact", matchScore: 1 });
      expect(link.humanId).toMatch(/^L-\d+$/);
      expect(String(link.sourceId)).toBe(sourceId);
      const passage = await Passage.findById(link.passageId).lean();
      expect(passage.text).toContain(link.quote);
    }
    const created = await AuditEvent.countDocuments({ projectId, action: "claim.created", actor: "ai" });
    expect(created).toBe(2);
  });

  it("drops a claim whose quote is fabricated and audits ai.quote_not_found", async () => {
    const { owner, projectId } = await setup();
    override.mock = ({ passages }) => ({
      claims: [
        {
          text: "Caching eliminates all latency in every workload",
          passageId: passages[0].id,
          quote: "caching eliminates all latency in every possible workload we measured",
        },
      ],
    });
    await ingest(owner, projectId);
    expect(await Claim.countDocuments({ projectId })).toBe(0);
    expect(await EvidenceLink.countDocuments({ projectId })).toBe(0);
    const event = await AuditEvent.findOne({ projectId, action: "ai.quote_not_found" }).lean();
    expect(event).toMatchObject({ actor: "ai", target: { kind: "passage", humanId: "P-1" } });
    expect(event.change.quote[1]).toMatch(/eliminates all latency/);
  });

  it("keeps the valid claims when only some quotes are fabricated, and reports a pipeline log", async () => {
    const { owner, projectId } = await setup();
    override.mock = () => ({ claims: [] }); // ingest without claims first
    const sourceId = await ingest(owner, projectId);
    const passages = await Passage.find({ sourceId }).sort({ charStart: 1 }).lean();
    override.mock = ({ passages: given }) => ({
      claims: [
        { text: "Caching reduces latency for workloads of type 1", passageId: given[0].id, quote: passages[0].text.slice(0, 60) },
        { text: "Caching doubles throughput on every benchmark", passageId: given[0].id, quote: "doubles throughput on every single benchmark" },
      ],
    });
    const result = await extractClaimsFromSource(sourceId);
    expect(result.created).toHaveLength(1);
    expect(result.dropped).toBe(1);
    expect(result.log.some((l) => /L4 drop .*quote_not_found/.test(l))).toBe(true);
    expect(result.log.some((l) => /L4 pass {2}C1 via P-1 exact/.test(l))).toBe(true);
  });

  it("fails the AI step (no claims) when the output cites a passage it wasn't shown", async () => {
    const { owner, projectId } = await setup();
    override.mock = () => ({ claims: [{ text: "A claim citing an invented passage id", passageId: "P-999", quote: "some words here" }] });
    await ingest(owner, projectId);
    expect(await Claim.countDocuments({ projectId })).toBe(0);
  });

  it("merges a near-duplicate claim found in a second source and links the new passage to it", async () => {
    const { owner, projectId } = await setup();
    const fixed = "Caching reduces latency for read-heavy workloads in the generated notes";
    override.mock = ({ passages }) => ({ claims: [{ text: fixed, passageId: passages[0].id, quote: passages[0].text.slice(0, 50) }] });
    await ingest(owner, projectId, "caching");
    await ingest(owner, projectId, "batching");
    const claims = await Claim.find({ projectId }).lean();
    expect(claims).toHaveLength(1);
    expect(await EvidenceLink.countDocuments({ claimId: claims[0]._id })).toBe(2);
  });
});

describe("spreadSample", () => {
  it("takes items evenly across the list", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const s = spreadSample(items, 10);
    expect(s).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(spreadSample([1, 2], 10)).toEqual([1, 2]);
  });
});

describe("claim routes", () => {
  useTestDb();
  beforeEach(() => (override.mock = null));

  it("creates a user claim (201) and returns merged: true for the same text (200)", async () => {
    const { owner, base } = await setup();
    const body = { text: "Write-through caching lowers p99 latency for read-heavy services", scopeNote: "Single-region only" };
    const first = await request(app).post(base).set(owner.auth).send(body);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ merged: false, claim: { humanId: "C1", origin: "user", scopeNote: "Single-region only" } });
    expect(first.body.claim).not.toHaveProperty("embedding");
    const second = await request(app).post(base).set(owner.auth).send({ text: body.text });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ merged: true, claim: { id: first.body.claim.id } });
    expect((await request(app).post(base).set(owner.auth).send({ text: "short" })).status).toBe(400);
  });

  it("lists claims with link counts, and returns detail with populated passages and sources", async () => {
    const { owner, projectId, base } = await setup();
    await ingest(owner, projectId);
    await request(app).post(base).set(owner.auth).send({ text: "A user claim with no evidence linked to it yet" });

    const list = await request(app).get(base).set(owner.auth);
    expect(list.body.claims.map((c) => c.humanId)).toEqual(["C1", "C2", "C3"]);
    expect(list.body.claims[0].links).toEqual({ total: 1, byStance: { supports: 1 }, byStatus: { ai_suggested: 1 } });
    expect(list.body.claims[2].links).toEqual({ total: 0, byStance: {}, byStatus: {} });

    const detail = await request(app).get(`${base}/${list.body.claims[0].id}`).set(owner.auth);
    expect(detail.body.claim.humanId).toBe("C1");
    expect(detail.body.links).toHaveLength(1);
    const [link] = detail.body.links;
    expect(link.passage).toMatchObject({ humanId: expect.stringMatching(/^P-\d+$/), page: expect.any(Number) });
    expect(link.passage.text).toContain(link.quote);
    expect(link.source).toMatchObject({ title: "Notes on caching", sourceType: "unknown" });
  });

  it("edits a claim (re-embedding, audited with reason), shows history, and deletes with links", async () => {
    const { owner, projectId, base } = await setup();
    await ingest(owner, projectId);
    const c1 = await Claim.findOne({ projectId, humanId: "C1" }).select("+embedding");
    const url = `${base}/${c1.id}`;

    const patched = await request(app)
      .patch(url)
      .set(owner.auth)
      .send({ text: "Caching reduces median latency for workloads of type 1", reason: "Narrowed the scope" });
    expect(patched.body.claim.text).toBe("Caching reduces median latency for workloads of type 1");
    const after = await Claim.findById(c1._id).select("+embedding");
    expect(after.embedding).not.toEqual(c1.embedding);

    const history = await request(app).get(`${url}/history`).set(owner.auth);
    expect(history.body.events.map((e) => e.action)).toEqual(["claim.updated", "claim.created"]);
    expect(history.body.events[0]).toMatchObject({ reason: "Narrowed the scope", actorName: "Test User" });

    expect((await request(app).delete(url).set(owner.auth)).status).toBe(204);
    expect(await Claim.exists({ _id: c1._id })).toBeNull();
    expect(await EvidenceLink.countDocuments({ claimId: c1._id })).toBe(0);
    expect((await request(app).get(url).set(owner.auth)).status).toBe(404);
  });

  it("enforces roles and project scoping", async () => {
    const { owner, projectId, base } = await setup();
    const { body } = await request(app).post(base).set(owner.auth).send({ text: "A claim that only members can see and edit" });
    const viewer = await registerAndLogin(app);
    await request(app).post(`/api/projects/${projectId}/members`).set(owner.auth).send({ email: viewer.user.email, role: "viewer" });
    expect((await request(app).get(base).set(viewer.auth)).body.claims).toHaveLength(1);
    expect((await request(app).post(base).set(viewer.auth).send({ text: "Viewers cannot add claims here" })).status).toBe(403);
    expect((await request(app).patch(`${base}/${body.claim.id}`).set(viewer.auth).send({ scopeNote: "x" })).status).toBe(403);
    expect((await request(app).delete(`${base}/${body.claim.id}`).set(viewer.auth)).status).toBe(403);

    const other = await setup();
    expect((await request(app).get(`${other.base}/${body.claim.id}`).set(other.owner.auth)).status).toBe(404);
  });
});
