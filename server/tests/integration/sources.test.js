import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { readFile } from "node:fs/promises";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { makePdf } from "../helpers/pdf.js";
import { drain } from "../../src/jobs/runner.js";
import { Source } from "../../src/models/Source.js";
import { Passage } from "../../src/models/Passage.js";
import { EvidenceLink } from "../../src/models/EvidenceLink.js";
import { resumeInterruptedJobs } from "../../src/services/ingestion/pipeline.js";

vi.mock("../../src/services/ingestion/fetchUrl.js", () => ({ fetchUrl: vi.fn() }));
const { fetchUrl } = await import("../../src/services/ingestion/fetchUrl.js");

const app = createApp();
const line = (n, topic) => `Sentence ${n} of a generated test document about ${topic} and how it behaves.`;
const pdfFor = (topic, title) =>
  makePdf(
    [
      [[line(1, topic), line(2, topic)], [line(3, topic), line(4, topic), line(5, topic)]],
      [[line(6, topic), line(7, topic)]],
    ],
    { title },
  );

async function setup() {
  const owner = await registerAndLogin(app);
  const { body } = await request(app).post("/api/projects").set(owner.auth).send({ name: "Sources test" });
  return { owner, base: `/api/projects/${body.project.id}/sources`, projectId: body.project.id };
}
const uploadPdf = (base, auth, buffer, filename = "paper.pdf") =>
  request(app).post(`${base}/upload`).set(auth).attach("file", buffer, { filename, contentType: "application/pdf" });

describe("sources", () => {
  useTestDb();
  beforeEach(() => fetchUrl.mockReset());

  it("ingests an uploaded PDF into passages that match the canonical text", async () => {
    const { owner, base } = await setup();
    const res = await uploadPdf(base, owner.auth, await pdfFor("indexing", "Indexing Notes"));
    expect(res.status).toBe(202);
    expect(res.body.source).toMatchObject({ kind: "pdf", status: "queued", title: "Indexing Notes", fileName: "paper.pdf" });
    expect(res.body.source).not.toHaveProperty("rawPages");
    await drain();

    const { body } = await request(app).get(`${base}/${res.body.source.id}`).set(owner.auth);
    expect(body.source).toMatchObject({ status: "ready", depth: "full_text" });
    expect(body.source.passageCount).toBeGreaterThan(0);
    expect(body.source.pageStarts).toHaveLength(2);

    const passages = await Passage.find({ sourceId: res.body.source.id }).select("+embedding").lean();
    expect(passages).toHaveLength(body.source.passageCount);
    for (const p of passages) {
      expect(p.humanId).toMatch(/^P-\d+$/);
      expect(body.source.text.slice(p.charStart, p.charEnd)).toBe(p.text);
      expect(p.embedding).toHaveLength(768);
    }
    expect(passages.some((p) => p.page === 2)).toBe(true);
    const raw = await Source.findById(res.body.source.id).select("+rawPages").lean();
    expect(raw.rawPages ?? []).toEqual([]); // freed once ready
  });

  it("paginates passages without embeddings", async () => {
    const { owner, base } = await setup();
    const { body: up } = await uploadPdf(base, owner.auth, await pdfFor("caching", "Caching"));
    await drain();
    const page1 = await request(app).get(`${base}/${up.source.id}/passages`).query({ limit: 1 }).set(owner.auth);
    expect(page1.body).toMatchObject({ page: 1, limit: 1, total: expect.any(Number) });
    expect(page1.body.passages).toHaveLength(1);
    expect(page1.body.passages[0]).not.toHaveProperty("embedding");
    const page2 = await request(app).get(`${base}/${up.source.id}/passages`).query({ limit: 1, page: 2 }).set(owner.auth);
    expect(page2.body.passages[0].charStart).toBeGreaterThan(page1.body.passages[0].charStart);
  });

  it("fails a duplicate document with a clear message", async () => {
    const { owner, base } = await setup();
    const pdf = await pdfFor("replication", "Replication");
    await uploadPdf(base, owner.auth, pdf);
    await drain();
    const { body } = await uploadPdf(base, owner.auth, pdf, "copy.pdf");
    await drain();
    const dup = await Source.findById(body.source.id).lean();
    expect(dup.status).toBe("failed");
    expect(dup.error).toMatch(/already in the project \("Replication"\)/);
  });

  it("ingests a URL source via the (mocked) fetcher and classifies it", async () => {
    const { owner, base } = await setup();
    fetchUrl.mockResolvedValue({
      finalUrl: "https://someone.medium.com/index-choice",
      contentType: "text/html",
      buffer: Buffer.from(await readFile(new URL("../fixtures/article.html", import.meta.url))),
    });
    const res = await request(app).post(base).set(owner.auth).send({ url: "https://medium.com/@someone/index-choice" });
    expect(res.status).toBe(202);
    await drain();
    expect(fetchUrl).toHaveBeenCalledWith("https://medium.com/@someone/index-choice");
    const source = await Source.findById(res.body.source.id).select("+text").lean();
    expect(source).toMatchObject({ status: "ready", sourceType: "blog", year: 2024, authors: ["Jane Example"] });
    expect(source.title).toMatch(/Why Index Choice Matters/);
    expect(source.text.split("\n\n").length).toBeGreaterThanOrEqual(5);
  });

  it("marks a source failed when fetching fails, and can retry it", async () => {
    const { owner, base } = await setup();
    fetchUrl.mockRejectedValueOnce(new Error("The page returned HTTP 503"));
    const { body } = await request(app).post(base).set(owner.auth).send({ url: "https://example.com/flaky" });
    await drain();
    let source = await Source.findById(body.source.id).lean();
    expect(source).toMatchObject({ status: "failed", error: "The page returned HTTP 503" });

    fetchUrl.mockResolvedValueOnce({
      finalUrl: "https://example.com/flaky",
      contentType: "text/html",
      buffer: await readFile(new URL("../fixtures/article.html", import.meta.url)),
    });
    const retry = await request(app).post(`${base}/${body.source.id}/retry`).set(owner.auth);
    expect(retry.status).toBe(202);
    await drain();
    source = await Source.findById(body.source.id).lean();
    expect(source.status).toBe("ready");
    expect(source.error).toBeUndefined();
    expect((await request(app).post(`${base}/${body.source.id}/retry`).set(owner.auth)).status).toBe(409);
  });

  it("validates input: URL body, non-PDF uploads, missing files and oversized files", async () => {
    const { owner, base } = await setup();
    expect((await request(app).post(base).set(owner.auth).send({ url: "javascript:alert(1)" })).status).toBe(400);
    expect((await request(app).post(base).set(owner.auth).send({ url: "not a url" })).status).toBe(400);
    const txt = await request(app).post(`${base}/upload`).set(owner.auth).attach("file", Buffer.from("hello"), { filename: "a.txt", contentType: "text/plain" });
    expect(txt.status).toBe(415);
    expect((await request(app).post(`${base}/upload`).set(owner.auth)).status).toBe(400);
    const bad = await uploadPdf(base, owner.auth, Buffer.from("%PDF-1.4 garbage"));
    expect(bad.status).toBe(422);
    const big = await uploadPdf(base, owner.auth, Buffer.alloc(16 * 1024 * 1024, 1)); // MAX_UPLOAD_MB defaults to 15
    expect(big.status).toBe(413);
    expect(big.body.error).toMatch(/too large \(max 15 MB\)/);
  });

  it("lets editors correct the type and title (audited), and enforces roles", async () => {
    const { owner, base, projectId } = await setup();
    const { body } = await uploadPdf(base, owner.auth, await pdfFor("sharding", "Sharding"));
    await drain();
    const url = `${base}/${body.source.id}`;
    const patched = await request(app).patch(url).set(owner.auth).send({ sourceType: "peer_reviewed", title: "Sharding (2nd ed.)" });
    expect(patched.body.source).toMatchObject({ sourceType: "peer_reviewed", title: "Sharding (2nd ed.)" });
    expect((await request(app).patch(url).set(owner.auth).send({ sourceType: "rumour" })).status).toBe(400);

    const audit = await request(app).get(`/api/projects/${projectId}/audit`).set(owner.auth);
    expect(audit.body.events[0]).toMatchObject({
      action: "source.updated",
      change: { sourceType: ["unknown", "peer_reviewed"], title: ["Sharding", "Sharding (2nd ed.)"] },
    });

    const viewer = await registerAndLogin(app);
    await request(app).post(`/api/projects/${projectId}/members`).set(owner.auth).send({ email: viewer.user.email, role: "viewer" });
    expect((await request(app).get(base).set(viewer.auth)).body.sources).toHaveLength(1);
    expect((await request(app).patch(url).set(viewer.auth).send({ title: "x" })).status).toBe(403);
    expect((await request(app).post(base).set(viewer.auth).send({ url: "https://example.com" })).status).toBe(403);
    expect((await request(app).delete(url).set(viewer.auth)).status).toBe(403);
  });

  it("deletes a source with its passages and links, and hides other projects' sources", async () => {
    const { owner, base, projectId } = await setup();
    const { body } = await uploadPdf(base, owner.auth, await pdfFor("consensus", "Consensus"));
    await drain();
    const passage = await Passage.findOne({ sourceId: body.source.id });
    await EvidenceLink.create({ projectId, claimId: passage._id, passageId: passage._id, sourceId: body.source.id, stance: "supports" });

    const other = await setup();
    expect((await request(app).get(`${other.base}/${body.source.id}`).set(other.owner.auth)).status).toBe(404);
    expect((await request(app).delete(`${other.base}/${body.source.id}`).set(other.owner.auth)).status).toBe(404);

    expect((await request(app).delete(`${base}/${body.source.id}`).set(owner.auth)).status).toBe(204);
    expect(await Source.exists({ _id: body.source.id })).toBeNull();
    expect(await Passage.countDocuments({ sourceId: body.source.id })).toBe(0);
    expect(await EvidenceLink.countDocuments({ sourceId: body.source.id })).toBe(0);
    expect((await request(app).get(`${base}/not-an-id`).set(owner.auth)).status).toBe(400);
  });

  it("resumes jobs interrupted by a restart", async () => {
    const { owner, base } = await setup();
    const { body } = await uploadPdf(base, owner.auth, await pdfFor("recovery", "Recovery"));
    await drain();
    // Simulate a crash mid-run: back to processing, passages half-written, raw pages still stored
    const pages = ["Page one text that is long enough to be a passage on its own, for the resume test.", "Page two text."];
    await Source.updateOne({ _id: body.source.id }, { status: "processing", rawPages: pages, $unset: { textHash: 1 } });
    await Passage.deleteMany({ sourceId: body.source.id, humanId: { $ne: "P-1" } });

    await resumeInterruptedJobs();
    await drain();
    const source = await Source.findById(body.source.id).select("+text").lean();
    expect(source.status).toBe("ready");
    expect(source.text).toBe(pages.join("\n\n"));
    const passages = await Passage.find({ sourceId: body.source.id }).lean();
    expect(passages.every((p) => source.text.slice(p.charStart, p.charEnd) === p.text)).toBe(true);
    expect(passages.every((p) => p.humanId !== "P-1")).toBe(true); // stale partial results were replaced
  });
});
