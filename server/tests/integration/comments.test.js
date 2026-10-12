import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { projectWithLink } from "../helpers/fixtures.js";

const app = createApp();

describe("comments and disputes", () => {
  useTestDb();

  it("posts, lists (oldest first, with author names), counts and resolves comments", async () => {
    const owner = await registerAndLogin(app, { name: "Ada Owner" });
    const { link, base } = await projectWithLink(app, owner);
    const target = { targetKind: "link", targetId: String(link._id) };

    const first = await request(app).post(`${base}/comments`).set(owner.auth).send({ ...target, text: "  First thought  " }).expect(201);
    expect(first.body.comment).toMatchObject({ text: "First thought", authorName: "Ada Owner", resolved: false, authorId: owner.user.id });
    await request(app).post(`${base}/comments`).set(owner.auth).send({ ...target, text: "Second" }).expect(201);

    const list = await request(app).get(`${base}/comments`).query(target).set(owner.auth).expect(200);
    expect(list.body.comments.map((c) => c.text)).toEqual(["First thought", "Second"]);

    await request(app).patch(`${base}/comments/${first.body.comment.id}`).set(owner.auth).send({ resolved: true }).expect(200);
    const counts = await request(app).get(`${base}/comments/counts`).query({ targetKind: "link" }).set(owner.auth).expect(200);
    expect(counts.body.counts).toEqual({ [String(link._id)]: { total: 2, open: 1 } });

    const audit = await request(app).get(`${base}/audit`).query({ targetId: String(link._id) }).set(owner.auth);
    expect(audit.body.events.filter((e) => e.action === "comment.added")).toHaveLength(2);
  });

  it("validates input, checks the target belongs to the project and enforces roles", async () => {
    const owner = await registerAndLogin(app);
    const viewer = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const { link, base } = await projectWithLink(app, owner);
    const foreign = await projectWithLink(app, other);
    await request(app).post(`${base}/members`).set(owner.auth).send({ email: viewer.user.email, role: "viewer" }).expect(201);
    const target = { targetKind: "link", targetId: String(link._id) };

    await request(app).post(`${base}/comments`).set(owner.auth).send({ ...target, text: "   " }).expect(400);
    await request(app).post(`${base}/comments`).set(owner.auth).send({ ...target, text: "x".repeat(2001) }).expect(400);
    await request(app).post(`${base}/comments`).set(owner.auth).send({ targetKind: "source", targetId: target.targetId, text: "x" }).expect(400);
    await request(app).post(`${base}/comments`).set(owner.auth).send({ targetKind: "link", targetId: String(foreign.link._id), text: "x" }).expect(404);
    await request(app).post(`${base}/comments`).set(viewer.auth).send({ ...target, text: "x" }).expect(403);
    await request(app).get(`${base}/comments`).query(target).set(viewer.auth).expect(200);
    await request(app).get(`${base}/comments`).query(target).set(other.auth).expect(404);
    await request(app).patch(`${base}/comments/${link._id}`).set(owner.auth).send({ resolved: true }).expect(404);
  });

  it("a dispute opens the thread with its reason; resolving it needs a reason, posts it and closes the thread", async () => {
    const owner = await registerAndLogin(app, { name: "Ada Owner" });
    const { link, base } = await projectWithLink(app, owner);
    const url = `${base}/links/${link._id}`;
    const thread = { targetKind: "link", targetId: String(link._id) };

    await request(app).patch(url).set(owner.auth).send({ status: "disputed", reason: "Different workload" }).expect(200);
    await request(app).post(`${base}/comments`).set(owner.auth).send({ ...thread, text: "Section 4 measures reads only" }).expect(201);

    const noReason = await request(app).patch(url).set(owner.auth).send({ status: "confirmed" });
    expect(noReason.status).toBe(400);
    expect(noReason.body.details).toMatchObject({ why: "resolving a dispute" });

    await request(app).patch(url).set(owner.auth).send({ status: "confirmed", reason: "Section 5 covers writes too" }).expect(200);
    const { body } = await request(app).get(`${base}/comments`).query(thread).set(owner.auth);
    expect(body.comments.map((c) => [c.text, c.resolved])).toEqual([
      ["Disputed: Different workload", true],
      ["Section 4 measures reads only", true],
      ["Resolved as confirmed: Section 5 covers writes too", true],
    ]);
    const audit = await request(app).get(`${base}/audit`).query({ targetId: String(link._id) }).set(owner.auth);
    expect(audit.body.events.find((e) => e.action === "link.review" && e.change.status?.[0] === "disputed")).toMatchObject({
      change: { status: ["disputed", "confirmed"] },
      reason: "Section 5 covers writes too",
    });

    // Moving a dispute back to under_review is not a resolution: no reason needed, thread stays as it is
    await request(app).patch(url).set(owner.auth).send({ status: "disputed", reason: "Still unsure" }).expect(200);
    await request(app).patch(url).set(owner.auth).send({ status: "under_review" }).expect(200);
    const counts = await request(app).get(`${base}/comments/counts`).query({ targetKind: "link" }).set(owner.auth);
    expect(counts.body.counts[String(link._id)]).toEqual({ total: 4, open: 1 });
  });
});
