import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { projectWithLink } from "../helpers/fixtures.js";
import { Source } from "../../src/models/Source.js";

const app = createApp();
const today = new Date().toISOString().slice(0, 10);

describe("export routes", () => {
  useTestDb();

  it("downloads Markdown with the project's confirmed evidence and a dated file name", async () => {
    const owner = await registerAndLogin(app);
    const { link, base } = await projectWithLink(app, owner);
    await request(app).patch(`${base}/links/${link._id}`).set(owner.auth).send({ status: "confirmed" }).expect(200);

    const res = await request(app).get(`${base}/export`).query({ format: "md" }).set(owner.auth).set("Origin", "http://localhost:5173").expect(200);
    expect(res.headers["content-type"]).toBe("text/markdown; charset=utf-8");
    expect(res.headers["content-disposition"]).toBe(`attachment; filename=proofchain-realtime-${today}.md`);
    expect(res.headers["access-control-expose-headers"]).toContain("Content-Disposition");
    expect(res.text).toContain("# Realtime");
    expect(res.text).toContain("### C1: Fixture claim one");
    expect(res.text).toContain("> Generated passage one.");
  });

  it("downloads BibTeX with verified sources only; viewers may export; others get 404; bad formats 400", async () => {
    const owner = await registerAndLogin(app);
    const viewer = await registerAndLogin(app);
    const outsider = await registerAndLogin(app);
    const { projectId, base } = await projectWithLink(app, owner);
    await request(app).post(`${base}/members`).set(owner.auth).send({ email: viewer.user.email, role: "viewer" }).expect(201);
    await Source.create({
      projectId,
      addedBy: owner.user.id,
      kind: "paper",
      status: "ready",
      title: "Fixture verified paper",
      authors: ["Ada Example"],
      year: 2022,
      ids: { doi: "10.5555/fixture-003" },
    });

    const res = await request(app).get(`${base}/export`).query({ format: "bib" }).set(viewer.auth).expect(200);
    expect(res.headers["content-type"]).toBe("application/x-bibtex; charset=utf-8");
    expect(res.headers["content-disposition"]).toBe(`attachment; filename=proofchain-realtime-${today}.bib`);
    expect(res.text).toContain("@misc{example2022fixture,");
    expect(res.text).toContain("doi = {10.5555/fixture-003}");
    expect(res.text).toContain("1 source was left out"); // the fixture URL source has no URL → not citable

    await request(app).get(`${base}/export`).query({ format: "bib" }).set(outsider.auth).expect(404);
    await request(app).get(`${base}/export`).query({ format: "docx" }).set(owner.auth).expect(400);
    await request(app).get(`${base}/export`).expect(401);
  });
});
