import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { makePdf } from "../helpers/pdf.js";
import { drain } from "../../src/jobs/runner.js";
import { Source } from "../../src/models/Source.js";
import { Passage } from "../../src/models/Passage.js";
import { Claim } from "../../src/models/Claim.js";
import { EvidenceLink } from "../../src/models/EvidenceLink.js";
import { AuditEvent } from "../../src/models/AuditEvent.js";
import { embedTexts } from "../../src/services/ai/embeddings.js";
import { linkClaim } from "../../src/services/evidence/linker.js";
import { statusFrom } from "../../src/services/evidence/claimStatus.js";
import { reserveHumanIds } from "../../src/utils/ids.js";
import { TRANSITIONS } from "../../src/services/evidence/reviewService.js";

const override = vi.hoisted(() => ({ stance: null, extract: null }));
vi.mock("../../src/services/ai/prompts/classifyStance.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, mock: (input) => (override.stance ?? real.mock)(input) };
});
// Keep claim extraction out of the way unless a test needs it
vi.mock("../../src/services/ai/prompts/extractClaims.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, mock: (input) => (override.extract ?? (() => ({ claims: [] })))(input) };
});

const app = createApp();
// Generated text only. Passages share words with the claim to different degrees so retrieval order is fixed.
const CLAIM = "Write-through caching lowers read latency for read-heavy services";
const TEXTS = [
  "Write-through caching lowers read latency for read-heavy services in our generated example.",
  "Write-through caching lowers read latency, but only when the cache fits in memory.",
  "Caching lowers latency in some generated services and has no effect in others.",
  "The generated report also discusses backup schedules for archival storage.",
];

async function setup() {
  const owner = await registerAndLogin(app);
  const { body } = await request(app).post("/api/projects").set(owner.auth).send({ name: "Links test" });
  const projectId = new mongoose.Types.ObjectId(body.project.id);
  const source = await Source.create({ projectId, addedBy: owner.user.id, kind: "url", url: "https://example.com/a", title: "Generated A", status: "ready" });
  const vectors = await embedTexts(TEXTS);
  const ids = await reserveHumanIds(projectId, "passage", TEXTS.length); // P-1…P-4, keeps the counter in sync
  const passages = await Passage.create(
    TEXTS.map((text, i) => ({ projectId, sourceId: source._id, humanId: ids[i], text, charStart: i * 100, charEnd: i * 100 + text.length, embedding: vectors[i] })),
  );
  const res = await request(app).post(`/api/projects/${projectId}/claims`).set(owner.auth).send({ text: CLAIM });
  await drain(); // the POST schedules linking with the default mock
  const claim = await Claim.findById(res.body.claim.id);
  return { owner, projectId, source, passages, claim, base: `/api/projects/${projectId}/links` };
}
const linksOf = (claim) => EvidenceLink.find({ claimId: claim._id }).sort({ humanId: 1 }).lean();
const passageOf = (passages, link) => passages.find((p) => p._id.equals(link.passageId));

describe("evidence linker (AI mock)", () => {
  useTestDb();
  beforeEach(() => {
    override.stance = null;
    override.extract = null;
  });

  it("creates ai_suggested links with the classified stances; irrelevant creates none", async () => {
    const { claim, passages } = await setup();
    const links = await linksOf(claim);
    // mock cycles supports, contradicts, inconclusive, irrelevant over candidates in retrieval order
    expect(links.map((l) => [passageOf(passages, l).humanId, l.stance])).toEqual([
      ["P-1", "supports"],
      ["P-2", "contradicts"],
      ["P-3", "inconclusive"],
    ]);
    for (const l of links) {
      expect(l).toMatchObject({ status: "ai_suggested", origin: "ai", matchType: "exact", aiRationale: "mock" });
      expect(passageOf(passages, l).text).toContain(l.quote);
    }
    expect(links.map((l) => l.humanId)).toEqual(["L-1", "L-2", "L-3"]);
    const updated = await Claim.findById(claim._id).lean();
    expect(updated).toMatchObject({ status: "open", provisionalStatus: "contested" }); // AI-only → status stays open
  });

  it("drops a fabricated quote and audits link.discarded", async () => {
    const { claim, projectId } = await setup();
    await EvidenceLink.deleteMany({});
    override.stance = ({ passages }) => ({
      results: passages.map((p) => ({ passageId: p.id, stance: "supports", quote: "caching makes every service infinitely fast", reason: "x" })),
    });
    const lines = await linkClaim(claim._id);
    expect(await EvidenceLink.countDocuments({ claimId: claim._id })).toBe(0);
    expect(await AuditEvent.countDocuments({ projectId, action: "link.discarded", actor: "ai" })).toBe(4);
    expect(lines.filter((l) => /L4 drop  P-\d/.test(l))).toHaveLength(4);
  });

  it("re-running never changes reviewed links and doesn't burn link IDs", async () => {
    const { owner, claim, base } = await setup();
    const [l1, l2] = await linksOf(claim);
    await request(app).patch(`${base}/${l1._id}`).set(owner.auth).send({ status: "confirmed" }).expect(200);

    override.stance = ({ passages }) => ({
      results: passages.map((p) => ({ passageId: p.id, stance: "contradicts", quote: p.text.slice(0, 40), reason: "rerun" })),
    });
    await linkClaim(claim._id);
    const after = await linksOf(claim);
    expect(after.find((l) => l._id.equals(l1._id))).toMatchObject({ status: "confirmed", stance: "supports", aiRationale: "mock" });
    expect(after.find((l) => l._id.equals(l2._id))).toMatchObject({ status: "ai_suggested", stance: "contradicts", aiRationale: "rerun" });
    expect(after.map((l) => l.humanId)).toEqual(["L-1", "L-2", "L-3", "L-4"]); // P-4 is now relevant → L-4, no gaps
  });

  it("links existing claims to a newly ingested source", async () => {
    const { owner, projectId, claim } = await setup();
    const pdf = await makePdf([
      [
        ["Write-through caching lowers read latency for read-heavy services in a second generated study."],
        ["The second generated study also covers backup schedules, archival storage tiers and retention."],
        ["Its appendix lists unrelated configuration notes about logging verbosity and alert routing."],
      ],
    ]);
    const { body } = await request(app)
      .post(`/api/projects/${projectId}/sources/upload`)
      .set(owner.auth)
      .attach("file", pdf, { filename: "b.pdf", contentType: "application/pdf" });
    await drain();
    const fromNew = await EvidenceLink.find({ claimId: claim._id, sourceId: body.source.id }).lean();
    expect(fromNew.length).toBeGreaterThan(0); // linked against the new source only
    expect(fromNew.every((l) => l.status === "ai_suggested")).toBe(true);
    const older = await EvidenceLink.countDocuments({ claimId: claim._id, sourceId: { $ne: body.source.id } });
    expect(older).toBe(3); // links to the first source untouched
  });
});

describe("claim status", () => {
  it("derives status from links", () => {
    expect(statusFrom([])).toBe("open");
    expect(statusFrom([{ stance: "inconclusive" }])).toBe("open");
    expect(statusFrom([{ stance: "supports" }])).toBe("supported");
    expect(statusFrom([{ stance: "contradicts" }])).toBe("unsupported");
    expect(statusFrom([{ stance: "supports" }, { stance: "contradicts" }])).toBe("contested");
  });
});

describe("review workflow (L6)", () => {
  useTestDb();
  beforeEach(() => {
    override.stance = null;
    override.extract = null;
  });

  it("confirmed supports + confirmed contradicts → contested; rejecting the contradiction → supported", async () => {
    const { owner, claim, base } = await setup();
    const [sup, con] = await linksOf(claim);
    await request(app).patch(`${base}/${sup._id}`).set(owner.auth).send({ status: "confirmed" }).expect(200);
    expect(await Claim.findById(claim._id).lean()).toMatchObject({ status: "supported" });
    await request(app).patch(`${base}/${con._id}`).set(owner.auth).send({ status: "confirmed" }).expect(200);
    expect(await Claim.findById(claim._id).lean()).toMatchObject({ status: "contested", provisionalStatus: "contested" });
    await request(app).patch(`${base}/${con._id}`).set(owner.auth).send({ status: "rejected", reason: "Different workload" }).expect(200);
    expect(await Claim.findById(claim._id).lean()).toMatchObject({ status: "supported", provisionalStatus: "supported" });
  });

  it("enforces transitions (409) and required reasons (400), and audits the change", async () => {
    const { owner, claim, base, projectId } = await setup();
    const [l1] = await linksOf(claim);
    const url = `${base}/${l1._id}`;

    const noReason = await request(app).patch(url).set(owner.auth).send({ status: "rejected" });
    expect(noReason.status).toBe(400);
    expect(noReason.body).toMatchObject({ error: "A reason is required for this change", details: { field: "reason" } });

    const rejected = await request(app).patch(url).set(owner.auth).send({ status: "rejected", reason: "Scope differs" });
    expect(rejected.body.link).toMatchObject({ status: "rejected", reviewedBy: owner.user.id, claim: { humanId: claim.humanId } });

    const invalid = await request(app).patch(url).set(owner.auth).send({ status: "disputed", reason: "x" });
    expect(invalid.status).toBe(409);
    expect(invalid.body.error).toBe("Cannot move a link from rejected to disputed");
    expect((await request(app).patch(url).set(owner.auth).send({ status: "ai_suggested" })).status).toBe(409);

    const event = await AuditEvent.findOne({ projectId, action: "link.review" }).lean();
    expect(event).toMatchObject({
      actor: owner.user.id,
      actorName: "Test User",
      target: { kind: "link", humanId: "L-1" },
      change: { status: ["ai_suggested", "rejected"] },
      reason: "Scope differs",
    });
    for (const [from, tos] of Object.entries(TRANSITIONS)) expect(tos).not.toContain(from);
  });

  it("changing an AI stance needs a reason, moves it out of ai_suggested, and survives re-linking", async () => {
    const { owner, claim, base } = await setup();
    const [, l2] = await linksOf(claim);
    const url = `${base}/${l2._id}`;
    expect((await request(app).patch(url).set(owner.auth).send({ stance: "supports" })).status).toBe(400);
    const res = await request(app).patch(url).set(owner.auth).send({ stance: "supports", scope: "In-memory caches", reason: "Misread" });
    expect(res.body.link).toMatchObject({ stance: "supports", scope: "In-memory caches", status: "under_review" });

    await linkClaim(claim._id);
    expect(await EvidenceLink.findById(l2._id).lean()).toMatchObject({ stance: "supports", status: "under_review" });
    const history = await request(app).get(`/api/projects/${claim.projectId}/claims/${claim._id}/history`).set(owner.auth);
    expect(history.body.events[0]).toMatchObject({
      action: "link.review",
      change: { status: ["ai_suggested", "under_review"], stance: ["contradicts", "supports"], scope: [null, "In-memory caches"] },
    });
  });

  it("filters the review queue by status and claim", async () => {
    const { owner, claim, base } = await setup();
    const [l1] = await linksOf(claim);
    await request(app).patch(`${base}/${l1._id}`).set(owner.auth).send({ status: "disputed", reason: "Unclear" });
    const queue = await request(app).get(base).query({ status: "ai_suggested,disputed" }).set(owner.auth);
    expect(queue.body.links.map((l) => l.status).sort()).toEqual(["ai_suggested", "ai_suggested", "disputed"]);
    expect(queue.body.links[0]).toMatchObject({ claim: { humanId: "C1" }, passage: { humanId: expect.any(String) }, source: { title: "Generated A" } });
    expect((await request(app).get(base).query({ status: "confirmed" }).set(owner.auth)).body.links).toEqual([]);
    expect((await request(app).get(base).query({ claimId: claim.id }).set(owner.auth)).body.links).toHaveLength(3);
    expect((await request(app).get(base).query({ status: "maybe" }).set(owner.auth)).status).toBe(400);
  });

  it("adds manual links only with a quote that passes L4", async () => {
    const { owner, claim, passages, base } = await setup();
    const p4 = passages[3];
    const body = { claimId: claim.id, passageId: p4.id, stance: "inconclusive" };
    const fake = await request(app).post(base).set(owner.auth).send({ ...body, quote: "caching is discussed at great length here" });
    expect(fake.status).toBe(422);
    const ok = await request(app).post(base).set(owner.auth).send({ ...body, quote: "\u201Cdiscusses backup schedules for archival storage\u201D" });
    expect(ok.status).toBe(201);
    expect(ok.body.link).toMatchObject({ status: "confirmed", origin: "user", quote: "discusses backup schedules for archival storage", matchType: "exact" });
    expect((await request(app).post(base).set(owner.auth).send({ ...body, quote: "backup schedules for archival" })).status).toBe(409);
    const other = await setup();
    expect((await request(app).post(other.base).set(other.owner.auth).send({ ...body, quote: "backup schedules" })).status).toBe(404);
  });

  it("runs linking on demand (202) and enforces editor role", async () => {
    const { owner, claim, base, projectId } = await setup();
    const run = await request(app).post(`${base}/claims/${claim.id}/run`).set(owner.auth);
    expect(run.status).toBe(202);
    await drain();
    const viewer = await registerAndLogin(app);
    await request(app).post(`/api/projects/${projectId}/members`).set(owner.auth).send({ email: viewer.user.email, role: "viewer" });
    const [l1] = await linksOf(claim);
    expect((await request(app).get(base).set(viewer.auth)).status).toBe(200);
    expect((await request(app).patch(`${base}/${l1._id}`).set(viewer.auth).send({ status: "confirmed" })).status).toBe(403);
    expect((await request(app).post(`${base}/claims/${claim.id}/run`).set(viewer.auth)).status).toBe(403);
  });
});
