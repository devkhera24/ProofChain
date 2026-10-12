import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { drain } from "../../src/jobs/runner.js";
import { Source } from "../../src/models/Source.js";
import { Passage } from "../../src/models/Passage.js";
import { Claim } from "../../src/models/Claim.js";
import { EvidenceLink } from "../../src/models/EvidenceLink.js";

const app = createApp();

/** The walkthrough shape: C1 with passages from two sources — confirmed support, confirmed contradiction,
 *  one AI-suggested, one disputed, one rejected (hidden). C2 has no links. */
async function setup() {
  const owner = await registerAndLogin(app);
  const { body } = await request(app).post("/api/projects").set(owner.auth).send({ name: "Graph" });
  await drain();
  const projectId = new mongoose.Types.ObjectId(body.project.id);
  const vendor = await Source.create({ projectId, addedBy: owner.user.id, kind: "url", title: "Vendor post", sourceType: "vendor", status: "ready" });
  const survey = await Source.create({ projectId, addedBy: owner.user.id, kind: "pdf", title: "Survey", sourceType: "peer_reviewed", status: "ready" });
  const mk = (humanId, sourceId, page) => Passage.create({ projectId, sourceId, humanId, text: `Generated passage ${humanId}.`, charStart: 0, charEnd: 10, page });
  const [p1, p2, p3, p4, p5] = await Promise.all([mk("P-1", vendor._id, 1), mk("P-2", vendor._id, 1), mk("P-3", survey._id, 4), mk("P-4", survey._id, 7), mk("P-5", survey._id, 9)]);
  const c1 = await Claim.create({ projectId, humanId: "C1", text: "Fixture claim one", origin: "user", status: "contested", provisionalStatus: "contested", gaps: [{ type: "contested", weight: 0.85 }] });
  const c2 = await Claim.create({ projectId, humanId: "C2", text: "Fixture claim two", origin: "user" });
  const link = (humanId, p, stance, status) => EvidenceLink.create({ projectId, humanId, claimId: c1._id, passageId: p._id, sourceId: p.sourceId, stance, status, quote: "q" });
  await link("L-1", p1, "supports", "confirmed");
  await link("L-2", p3, "contradicts", "confirmed");
  await link("L-3", p2, "supports", "ai_suggested");
  await link("L-4", p4, "inconclusive", "disputed");
  await link("L-5", p5, "supports", "rejected");
  return { owner, projectId, vendor, survey, c1, c2, url: `/api/projects/${projectId}/graph` };
}
const kinds = (els) => els.map((e) => e.data.kind ?? "edge");
const byKind = (els, k) => els.filter((e) => (e.data.kind ?? "edge") === k);

describe("evidence graph endpoint", () => {
  useTestDb();

  it("returns claims, linked passages and one edge per non-rejected link", async () => {
    const { owner, c1, vendor, url } = await setup();
    const { body } = await request(app).get(url).set(owner.auth);
    expect(body.truncated).toBe(false);
    expect(body.counts).toEqual({ claims: 2, passages: 4, links: 4 });
    expect(byKind(body.elements, "claim").map((e) => e.data)).toEqual([
      expect.objectContaining({ id: `claim:${c1._id}`, label: "C1", status: "contested", gapCount: 1 }),
      expect.objectContaining({ label: "C2", status: "open", gapCount: 0 }),
    ]);
    const p1 = byKind(body.elements, "passage").find((e) => e.data.label === "P-1").data;
    expect(p1).toMatchObject({ sourceType: "vendor", sourceTitle: "Vendor post", sourceId: String(vendor._id), page: 1, text: "Generated passage P-1." });
    expect(byKind(body.elements, "passage").map((e) => e.data.label)).not.toContain("P-5"); // only rejected → hidden
    const edges = byKind(body.elements, "edge").map((e) => e.data);
    expect(edges.map((e) => [e.label, e.stance, e.status])).toEqual([
      ["L-1", "supports", "confirmed"],
      ["L-2", "contradicts", "confirmed"],
      ["L-3", "supports", "ai_suggested"],
      ["L-4", "inconclusive", "disputed"],
    ]);
    expect(edges[0]).toMatchObject({ source: `passage:${p1.id.split(":")[1]}`, target: `claim:${c1._id}`, linkId: expect.any(String) });
    // every edge endpoint exists
    const ids = new Set(body.elements.map((e) => e.data.id));
    expect(edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
  });

  it("filters by status, contested claims, source and claim", async () => {
    const { owner, c2, survey, url } = await setup();
    const unreviewed = (await request(app).get(url).query({ status: "unreviewed" }).set(owner.auth)).body;
    expect(byKind(unreviewed.elements, "edge").map((e) => e.data.status)).toEqual(["ai_suggested", "disputed"]);
    expect(byKind(unreviewed.elements, "claim").map((e) => e.data.label)).toEqual(["C1"]); // C2 has no matching links

    const contested = (await request(app).get(url).query({ contested: "true" }).set(owner.auth)).body;
    expect(byKind(contested.elements, "claim").map((e) => e.data.label)).toEqual(["C1"]);

    const fromSurvey = (await request(app).get(url).query({ sourceId: String(survey._id) }).set(owner.auth)).body;
    expect(byKind(fromSurvey.elements, "passage").map((e) => e.data.label)).toEqual(["P-3", "P-4"]);

    const onlyC2 = (await request(app).get(url).query({ claimId: String(c2._id) }).set(owner.auth)).body;
    expect(kinds(onlyC2.elements)).toEqual(["claim"]);

    expect((await request(app).get(url).query({ status: "maybe" }).set(owner.auth)).status).toBe(400);
  });

  it("caps at 400 elements and reports truncation", async () => {
    const { owner, projectId, url } = await setup();
    await Claim.insertMany(Array.from({ length: 450 }, (_, i) => ({ projectId, humanId: `C${i + 10}`, text: `Bulk claim ${i}`, origin: "user" })));
    const { body } = await request(app).get(url).set(owner.auth);
    expect(body.elements.length).toBeLessThanOrEqual(400);
    expect(body.truncated).toBe(true);
  });

  it("is scoped to members", async () => {
    const { url } = await setup();
    const stranger = await registerAndLogin(app);
    expect((await request(app).get(url).set(stranger.auth)).status).toBe(404);
  });
});
