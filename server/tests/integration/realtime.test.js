import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import http from "node:http";
import request from "supertest";
import { io as connectClient } from "socket.io-client";
import { createApp } from "../../src/app.js";
import { initSockets } from "../../src/sockets/index.js";
import { setIo } from "../../src/services/realtime/events.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { projectWithLink } from "../helpers/fixtures.js";

const app = createApp();
const server = http.createServer(app);
let io, url;
const clients = [];

function connect(token) {
  const socket = connectClient(url, { auth: token ? { token } : {}, transports: ["websocket"], reconnection: false, forceNew: true });
  clients.push(socket);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}
const join = (socket, projectId) => socket.emitWithAck("project:join", projectId);
/** Resolves with the next `event` payload, or null after `ms` (so "nothing arrived" can be asserted). */
/** Presence arrives after every join/leave, so wait for the list we expect instead of the next one. */
const presenceIs = (socket, names, ms = 1500) =>
  new Promise((resolve) => {
    const t = setTimeout(() => (socket.off("presence", h), resolve(false)), ms);
    const h = (users) => {
      if (JSON.stringify(users.map((u) => u.name).sort()) !== JSON.stringify([...names].sort())) return;
      clearTimeout(t);
      socket.off("presence", h);
      resolve(true);
    };
    socket.on("presence", h);
  });
const next = (socket, event, ms = 1500) =>
  new Promise((resolve) => {
    const t = setTimeout(() => (socket.off(event, h), resolve(null)), ms);
    const h = (payload) => (clearTimeout(t), resolve(payload));
    socket.once(event, h);
  });

describe("realtime (socket.io)", () => {
  useTestDb();
  beforeAll(async () => {
    io = initSockets(server);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(() => clients.splice(0).forEach((c) => c.disconnect()));
  afterAll(async () => {
    await new Promise((r) => io.close(r));
    setIo(null);
  });

  it("rejects connections without a valid token", async () => {
    await expect(connect()).rejects.toThrow("unauthorized");
    await expect(connect("not-a-jwt")).rejects.toThrow("unauthorized");
  });

  it("only members can join; a review emits link.updated to members only", async () => {
    const owner = await registerAndLogin(app, { name: "Owner" });
    const outsider = await registerAndLogin(app, { name: "Outsider" });
    const { projectId, link, claim, base } = await projectWithLink(app, owner);

    const member = await connect(owner.token);
    const stranger = await connect(outsider.token);
    expect(await join(member, projectId)).toEqual({ ok: true });
    expect(await join(stranger, projectId)).toEqual({ ok: false });
    expect(await join(stranger, "not-an-id")).toEqual({ ok: false });

    const memberGot = next(member, "link.updated");
    const strangerGot = next(stranger, "link.updated", 500);
    await request(app).patch(`${base}/links/${link._id}`).set(owner.auth).send({ status: "confirmed" }).expect(200);
    expect(await memberGot).toMatchObject({ linkId: String(link._id), claimId: String(claim._id), at: expect.any(Number) });
    expect(await strangerGot).toBeNull();
  });

  it("broadcasts presence (one entry per user) and drops users who leave or are removed", async () => {
    const owner = await registerAndLogin(app, { name: "Owner" });
    const editor = await registerAndLogin(app, { name: "Editor" });
    const { projectId, base, claim } = await projectWithLink(app, owner);
    await request(app).post(`${base}/members`).set(owner.auth).send({ email: editor.user.email, role: "editor" }).expect(201);

    const a = await connect(owner.token);
    await join(a, projectId);
    const a2 = await connect(owner.token); // a second tab for the same user
    await join(a2, projectId);
    const b = await connect(editor.token);
    const both = presenceIs(a, ["Editor", "Owner"]); // the owner's two tabs count once
    await join(b, projectId);
    expect(await both).toBe(true);

    const afterLeave = presenceIs(a, ["Owner"]);
    b.emit("project:leave");
    expect(await afterLeave).toBe(true);

    // Removing a member takes their sockets out of the room immediately
    const rejoined = presenceIs(a, ["Editor", "Owner"]);
    await join(b, projectId);
    expect(await rejoined).toBe(true);
    const removed = presenceIs(a, ["Owner"]);
    await request(app).delete(`${base}/members/${editor.user.id}`).set(owner.auth).expect(200);
    expect(await removed).toBe(true);
    const bGot = next(b, "comment.added", 500);
    const aGot = next(a, "comment.added");
    await request(app).post(`${base}/comments`).set(owner.auth).send({ targetKind: "claim", targetId: String(claim._id), text: "Only members hear this" }).expect(201);
    expect(await aGot).toMatchObject({ targetKind: "claim" });
    expect(await bGot).toBeNull();
  });

  it("emits comment.added when a comment is posted", async () => {
    const owner = await registerAndLogin(app);
    const { projectId, link, base } = await projectWithLink(app, owner);
    const s = await connect(owner.token);
    await join(s, projectId);
    const got = next(s, "comment.added");
    await request(app).post(`${base}/comments`).set(owner.auth).send({ targetKind: "link", targetId: String(link._id), text: "Is this the same workload?" }).expect(201);
    expect(await got).toMatchObject({ targetKind: "link", targetId: String(link._id) });
  });
});
