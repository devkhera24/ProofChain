import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { reserveHumanIds, nextHumanId } from "../../src/utils/ids.js";

const app = createApp();
const createProject = (auth, body = { name: "Sleep and memory", topics: ["sleep", "memory"] }) =>
  request(app).post("/api/projects").set(auth).send(body);

describe("projects", () => {
  useTestDb();

  it("requires authentication", async () => {
    expect((await request(app).get("/api/projects")).status).toBe(401);
  });

  it("makes the creator the owner and lists the project", async () => {
    const owner = await registerAndLogin(app);
    const created = await createProject(owner.auth);
    expect(created.status).toBe(201);
    expect(created.body.project).toMatchObject({ name: "Sleep and memory", level: "intermediate", topics: ["sleep", "memory"] });
    expect(created.body.project.members).toEqual([
      { userId: owner.user.id, role: "owner", name: owner.user.name, email: owner.user.email },
    ]);

    const list = await request(app).get("/api/projects").set(owner.auth);
    expect(list.body.projects).toHaveLength(1);
    expect(list.body.projects[0]).toMatchObject({ id: created.body.project.id, role: "owner" });

    const detail = await request(app).get(`/api/projects/${created.body.project.id}`).set(owner.auth);
    expect(detail.body).toMatchObject({ role: "owner", project: { id: created.body.project.id } });
  });

  it("validates the create body", async () => {
    const owner = await registerAndLogin(app);
    const res = await createProject(owner.auth, { name: "", topics: Array(11).fill("x") });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i) => i.path)).toEqual(expect.arrayContaining(["name", "topics"]));
  });

  it("returns 404 to non-members and for unknown or malformed ids", async () => {
    const owner = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);
    const { body } = await createProject(owner.auth);
    expect((await request(app).get(`/api/projects/${body.project.id}`).set(stranger.auth)).status).toBe(404);
    expect((await request(app).get(`/api/projects/${new mongoose.Types.ObjectId()}`).set(owner.auth)).status).toBe(404);
    expect((await request(app).get("/api/projects/not-an-id").set(owner.auth)).status).toBe(404);
    const list = await request(app).get("/api/projects").set(stranger.auth);
    expect(list.body.projects).toEqual([]);
  });

  it("lets owners add members and enforces roles", async () => {
    const owner = await registerAndLogin(app);
    const viewer = await registerAndLogin(app);
    const editor = await registerAndLogin(app);
    const { body } = await createProject(owner.auth);
    const url = `/api/projects/${body.project.id}`;

    const added = await request(app).post(`${url}/members`).set(owner.auth).send({ email: viewer.user.email, role: "viewer" });
    expect(added.status).toBe(201);
    expect(added.body.project.members).toHaveLength(2);
    await request(app).post(`${url}/members`).set(owner.auth).send({ email: editor.user.email, role: "editor" });

    // viewer: can read, cannot edit or manage members
    expect((await request(app).get(url).set(viewer.auth)).body.role).toBe("viewer");
    expect((await request(app).patch(url).set(viewer.auth).send({ goal: "x" })).status).toBe(403);
    expect((await request(app).post(`${url}/members`).set(viewer.auth).send({ email: "a@b.co", role: "viewer" })).status).toBe(403);

    // editor: can edit, cannot manage members
    const patched = await request(app).patch(url).set(editor.auth).send({ goal: "Literature review for a seminar", level: "advanced" });
    expect(patched.status).toBe(200);
    expect(patched.body.project).toMatchObject({ goal: "Literature review for a seminar", level: "advanced" });
    expect((await request(app).delete(`${url}/members/${viewer.user.id}`).set(editor.auth)).status).toBe(403);
  });

  it("rejects unknown member emails and protects the last owner", async () => {
    const owner = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const { body } = await createProject(owner.auth);
    const url = `/api/projects/${body.project.id}`;

    expect((await request(app).post(`${url}/members`).set(owner.auth).send({ email: "nobody@test.dev", role: "viewer" })).status).toBe(404);
    expect((await request(app).delete(`${url}/members/${owner.user.id}`).set(owner.auth)).status).toBe(400);

    await request(app).post(`${url}/members`).set(owner.auth).send({ email: other.user.email, role: "editor" });
    const removed = await request(app).delete(`${url}/members/${other.user.id}`).set(owner.auth);
    expect(removed.status).toBe(200);
    expect(removed.body.project.members).toHaveLength(1);
    expect((await request(app).get(url).set(other.auth)).status).toBe(404);
  });
});

describe("human-readable ids", () => {
  useTestDb();

  it("formats ids per kind and counts per project", async () => {
    const a = new mongoose.Types.ObjectId();
    const b = new mongoose.Types.ObjectId();
    expect(await reserveHumanIds(a, "passage", 2)).toEqual(["P-1", "P-2"]);
    expect(await nextHumanId(a, "passage")).toBe("P-3");
    expect(await nextHumanId(a, "claim")).toBe("C1");
    expect(await nextHumanId(b, "passage")).toBe("P-1");
  });

  it("gives unique consecutive ids under concurrent calls", async () => {
    const pid = new mongoose.Types.ObjectId();
    const ids = await Promise.all(Array.from({ length: 20 }, () => nextHumanId(pid, "claim")));
    expect(new Set(ids).size).toBe(20);
    expect([...ids].sort((x, y) => x.slice(1) - y.slice(1))).toEqual(Array.from({ length: 20 }, (_, i) => `C${i + 1}`));
  });
});
