import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { drain } from "../../src/jobs/runner.js";
import { Source } from "../../src/models/Source.js";
import { Passage } from "../../src/models/Passage.js";
import { Claim } from "../../src/models/Claim.js";
import { ChatMessage } from "../../src/models/ChatMessage.js";
import { RecommendationBatch } from "../../src/models/RecommendationBatch.js";
import { InterestProfile } from "../../src/models/InterestProfile.js";
import { embedTexts } from "../../src/services/ai/embeddings.js";
import { reserveHumanIds } from "../../src/utils/ids.js";
import { stripInvalidMarkers } from "../../src/services/agent/orchestrator.js";

const ctl = vi.hoisted(() => ({ answer: null, scheduled: [] }));
vi.mock("../../src/services/ai/prompts/answer.js", async (orig) => {
  const real = await orig();
  return { ...real, mock: (input) => (ctl.answer ?? real.mock)(input) };
});
// The recommender job itself is tested elsewhere; here we only check that chat creates/schedules a batch
vi.mock("../../src/services/recommender/pipeline.js", async (orig) => ({
  ...(await orig()),
  scheduleRecommendation: (args) => ctl.scheduled.push(args),
}));

const app = createApp();
// Generated text only
const TEXTS = [
  "Write-through caching lowers read latency for read-heavy services. The effect was measured on generated traffic.",
  "Caching has little effect when the working set exceeds memory. Misses dominate in that case.",
  "The report also covers backup schedules for archival storage tiers.",
];

async function setup({ withPassages = true } = {}) {
  const owner = await registerAndLogin(app);
  const { body } = await request(app).post("/api/projects").set(owner.auth).send({ name: "Chat", topics: ["caching"] });
  await drain();
  const projectId = new mongoose.Types.ObjectId(body.project.id);
  if (withPassages) {
    const source = await Source.create({ projectId, addedBy: owner.user.id, kind: "url", title: "Generated notes", status: "ready", sourceType: "blog" });
    const vecs = await embedTexts(TEXTS);
    const ids = await reserveHumanIds(projectId, "passage", TEXTS.length);
    await Passage.create(TEXTS.map((text, i) => ({ projectId, sourceId: source._id, humanId: ids[i], text, charStart: i * 200, charEnd: i * 200 + text.length, embedding: vecs[i] })));
  }
  return { owner, projectId, base: `/api/projects/${projectId}/chat` };
}
const send = (base, auth, message) => request(app).post(base).set(auth).send({ message });

describe("chat orchestrator (AI mock)", () => {
  useTestDb();
  beforeEach(() => {
    ctl.answer = null;
    ctl.scheduled.length = 0;
  });

  it("answers a question with validated citations, tracks a claim, and stores both messages", async () => {
    const { owner, projectId, base } = await setup();
    const res = await send(base, owner.auth, "Does write-through caching lower read latency?");
    expect(res.status).toBe(200);
    const { userMessage, agentMessage } = res.body;
    expect(userMessage).toMatchObject({ role: "user", content: "Does write-through caching lower read latency?", meta: { intent: "question" } });
    expect(agentMessage.role).toBe("agent");
    expect(agentMessage.meta).toMatchObject({ intent: "question", claimHumanId: "C1", validation: { proposed: 2, dropped: 0 }, recommended: false });
    expect(agentMessage.citations).toHaveLength(2);
    const passages = await Passage.find({ projectId }).lean();
    for (const c of agentMessage.citations) {
      const p = passages.find((x) => x.humanId === c.humanId);
      expect(p.text).toContain(c.quote);
      expect(agentMessage.content).toContain(`[${c.humanId}]`);
    }
    expect(agentMessage.content).toMatch(/Tracking this as claim C1\. Evidence links are provisional/);
    expect(await ChatMessage.countDocuments({ projectId })).toBe(2);
    await drain();
    const claim = await Claim.findOne({ projectId }).lean();
    expect(claim).toMatchObject({ humanId: "C1", origin: "ai_from_question" });
    const profile = await InterestProfile.findOne({ projectId }).lean();
    expect(profile.questionHistory.map((q) => q.text)).toEqual(["Does write-through caching lower read latency?"]);
  });

  it("strips a fabricated citation and reports dropped: 1", async () => {
    const { owner, base } = await setup();
    ctl.answer = ({ passages }) => ({
      answer: `Caching lowers read latency [${passages[0].id}]. It also doubles throughput everywhere [${passages[1].id}].`,
      citations: [
        { passageId: passages[0].id, quote: passages[0].text.split(". ")[0] },
        { passageId: passages[1].id, quote: "caching doubles throughput on every workload" },
      ],
      evidenceSufficient: true,
    });
    const { body } = await send(base, owner.auth, "Is caching always faster?");
    const m = body.agentMessage;
    expect(m.meta.validation).toMatchObject({ proposed: 2, dropped: 1 });
    expect(m.citations).toHaveLength(1);
    const [kept] = m.citations;
    expect(m.content).toContain(`[${kept.humanId}]`);
    expect(m.content).toMatch(/doubles throughput everywhere\./); // the sentence stays, its marker doesn't
    expect((m.content.match(/\[P-\d+\]/g) ?? [])).toEqual([`[${kept.humanId}]`]);
  });

  it("says so when no citation survives", async () => {
    const { owner, base } = await setup();
    ctl.answer = ({ passages }) => ({ answer: `Yes [${passages[0].id}].`, citations: [{ passageId: passages[0].id, quote: "invented words not present anywhere" }], evidenceSufficient: true });
    const { body } = await send(base, owner.auth, "Is it true?");
    expect(body.agentMessage.content).toMatch(/^I couldn't find passages in your sources that answer this reliably/);
    expect(body.agentMessage.citations).toEqual([]);
  });

  it("maps a repeated question to the existing claim and recommends on every 2nd question", async () => {
    const { owner, projectId, base } = await setup();
    await send(base, owner.auth, "Does write-through caching lower read latency?");
    const second = await send(base, owner.auth, "Does write-through caching lower read latency?");
    expect(second.body.agentMessage.content).toMatch(/Mapped to existing claim C1/);
    expect(second.body.agentMessage.meta.recommended).toBe(true);
    expect(await Claim.countDocuments({ projectId })).toBe(1);
    expect(ctl.scheduled).toEqual([expect.objectContaining({ trigger: "question", triggerText: "Does write-through caching lower read latency?" })]);
    expect(await RecommendationBatch.countDocuments({ projectId, trigger: "question" })).toBe(1);
  });

  it("handles a project without passages", async () => {
    const { owner, base } = await setup({ withPassages: false });
    const { body } = await send(base, owner.auth, "What does the evidence say about caching?");
    expect(body.agentMessage.content).toMatch(/no processed sources yet/);
    expect(body.agentMessage.meta.claimHumanId).toBe("C1");
  });

  it("routes recommend, claim and chitchat intents", async () => {
    const { owner, projectId, base } = await setup();
    const rec = await send(base, owner.auth, "Can you recommend papers on caching?");
    expect(rec.body.agentMessage.meta).toMatchObject({ intent: "recommend", batchId: expect.any(String) });
    expect(ctl.scheduled).toHaveLength(1);
    const again = await send(base, owner.auth, "Please suggest more papers on caching");
    expect(again.body.agentMessage.content).toMatch(/already being prepared/); // B1 is still "running"

    const claim = await send(base, owner.auth, "I think caching hurts write latency under heavy load");
    expect(claim.body.agentMessage.meta).toMatchObject({ intent: "claim", claimHumanId: "C1" });
    expect(await Claim.findOne({ projectId }).lean()).toMatchObject({ text: "caching hurts write latency under heavy load", origin: "user" });

    const hi = await send(base, owner.auth, "Thanks!");
    expect(hi.body.agentMessage).toMatchObject({ meta: { intent: "chitchat" }, citations: [] });
    expect(hi.body.agentMessage.content).toMatch(/Ask me something about caching/);
  });
});

describe("chat routes", () => {
  useTestDb();

  it("paginates history oldest-first with authors, validates input and enforces roles", async () => {
    const { owner, projectId, base } = await setup();
    await send(base, owner.auth, "Hello");
    await send(base, owner.auth, "Thanks");
    const all = await request(app).get(base).set(owner.auth);
    expect(all.body.messages.map((m) => m.role)).toEqual(["user", "agent", "user", "agent"]);
    expect(all.body.messages[0].author).toEqual({ id: owner.user.id, name: "Test User" });
    expect(all.body.hasMore).toBe(false);
    const page = await request(app).get(base).query({ limit: 2 }).set(owner.auth);
    expect(page.body).toMatchObject({ hasMore: true });
    expect(page.body.messages.map((m) => m.content)[0]).toBe("Thanks");
    const older = await request(app).get(base).query({ limit: 2, before: page.body.messages[0].createdAt }).set(owner.auth);
    expect(older.body.messages.map((m) => m.content)[0]).toBe("Hello");

    expect((await send(base, owner.auth, "   ")).status).toBe(400);
    expect((await send(base, owner.auth, "x".repeat(2001))).status).toBe(400);
    const viewer = await registerAndLogin(app);
    await request(app).post(`/api/projects/${projectId}/members`).set(owner.auth).send({ email: viewer.user.email, role: "viewer" });
    expect((await request(app).get(base).set(viewer.auth)).status).toBe(200);
    expect((await send(base, viewer.auth, "hi")).status).toBe(403);
  });
});

describe("stripInvalidMarkers", () => {
  it("removes unknown markers and tidies spacing", () => {
    expect(stripInvalidMarkers("A [P-1]. B [P-2], C [P-3] [P-1].", new Set(["P-1"]))).toBe("A [P-1]. B, C [P-1].");
  });
});
