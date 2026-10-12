import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { projectWithLink } from "../helpers/fixtures.js";
import { drain } from "../../src/jobs/runner.js";
import { Passage } from "../../src/models/Passage.js";
import { Source } from "../../src/models/Source.js";

const app = createApp();
const FORBIDDEN = ["embedding", "vector", "rawPages", "passwordHash"];

/** Paths of forbidden keys anywhere in a JSON value. */
function leaks(value, path = "$") {
  if (Array.isArray(value)) return value.flatMap((v, i) => leaks(v, `${path}[${i}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => [...(FORBIDDEN.includes(k) ? [`${path}.${k}`] : []), ...leaks(v, `${path}.${k}`)]);
  return [];
}

describe("production hardening", () => {
  useTestDb();

  it("no JSON endpoint returns vectors, raw pages or password hashes", async () => {
    const owner = await registerAndLogin(app);
    const { link, claim, base } = await projectWithLink(app, owner);
    const source = await Source.findOne({ projectId: link.projectId });
    await Source.updateOne({ _id: source._id }, { rawPages: ["Generated raw page."], text: "Generated passage one.", pageStarts: [0] });
    await Passage.updateMany({ projectId: link.projectId }, { embedding: Array(768).fill(0.01) });
    await request(app).post(`${base}/claims`).set(owner.auth).send({ text: "A second fixture claim for the leak check" }).expect(201);
    await request(app).post(`${base}/chat`).set(owner.auth).send({ message: "What do my sources say?" }).expect(200);
    await request(app).post(`${base}/comments`).set(owner.auth).send({ targetKind: "link", targetId: String(link._id), text: "Fixture comment" }).expect(201);
    await drain();

    const paths = [
      "/api/auth/me",
      "/api/projects",
      base,
      `${base}/sources`,
      `${base}/sources/${source._id}`,
      `${base}/sources/${source._id}/passages`,
      `${base}/claims`,
      `${base}/claims/${claim._id}`,
      `${base}/claims/${claim._id}/history`,
      `${base}/links`,
      `${base}/graph`,
      `${base}/profile`,
      `${base}/chat`,
      `${base}/comments?targetKind=link&targetId=${link._id}`,
      `${base}/audit`,
      `${base}/recommendations/latest`,
    ];
    for (const path of paths) {
      const res = await request(app).get(path).set(owner.auth);
      expect(res.status, path).toBe(200);
      expect(leaks(res.body), path).toEqual([]);
    }
    const login = await request(app).post("/api/auth/login").send({ email: owner.user.email, password: "password123" });
    expect(leaks(login.body)).toEqual([]);
  });

  it("rejects malformed ids in params and bodies with 400 instead of a server error", async () => {
    const owner = await registerAndLogin(app);
    const { base } = await projectWithLink(app, owner);
    await request(app).delete(`${base}/members/not-an-id`).set(owner.auth).expect(400);
    await request(app).patch(`${base}/profile`).set(owner.auth).send({ exclusion: { id: "nope", strength: "hard" } }).expect(400);
    await request(app).get(`${base}/claims/not-an-id`).set(owner.auth).expect(400);
    await request(app).get(`${base}/links`).query({ claimId: "x" }).set(owner.auth).expect(400);
  });
});
