import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";
import { recordAudit } from "../../src/services/audit/auditService.js";

const app = createApp();

describe("audit log", () => {
  useTestDb();

  async function setup() {
    const owner = await registerAndLogin(app);
    const { body } = await request(app).post("/api/projects").set(owner.auth).send({ name: "Audit test" });
    return { owner, projectId: body.project.id, url: `/api/projects/${body.project.id}/audit` };
  }

  it("records events and returns them newest first, filtered by target", async () => {
    const { owner, projectId, url } = await setup();
    const claimId = new mongoose.Types.ObjectId();
    await recordAudit({ projectId, actor: owner.user.id, actorName: "Test User", action: "claim.created",
      target: { kind: "claim", id: claimId, humanId: "C1" } });
    await recordAudit({ projectId, actor: "ai", action: "link.review",
      target: { kind: "link", id: new mongoose.Types.ObjectId(), humanId: "L-1" }, change: { status: ["ai_suggested", "confirmed"] } });

    const all = await request(app).get(url).set(owner.auth);
    expect(all.status).toBe(200);
    expect(all.body.events.map((e) => e.action)).toEqual(["link.review", "claim.created"]);
    expect(all.body.events[0]).toMatchObject({ actor: "ai", change: { status: ["ai_suggested", "confirmed"] } });
    expect(all.body.events[0]).not.toHaveProperty("_id");

    const filtered = await request(app).get(url).query({ targetId: claimId.toString() }).set(owner.auth);
    expect(filtered.body.events).toHaveLength(1);
    expect(filtered.body.events[0].target).toMatchObject({ kind: "claim", humanId: "C1" });

    expect((await request(app).get(url).query({ targetId: "nope" }).set(owner.auth)).status).toBe(400);
  });

  it("hides the log from non-members and has no write routes", async () => {
    const { url } = await setup();
    const stranger = await registerAndLogin(app);
    expect((await request(app).get(url).set(stranger.auth)).status).toBe(404);

    const { owner, url: ownUrl } = await setup();
    for (const method of ["post", "patch", "put", "delete"]) {
      expect((await request(app)[method](ownUrl).set(owner.auth).send({})).status).toBe(404);
    }
  });

  it("recordAudit never throws", async () => {
    await expect(recordAudit({ projectId: "not-an-id", actor: "system", action: "x" })).resolves.toBeUndefined();
    expect(await mongoose.connection.collection("auditevents").countDocuments()).toBe(0);
  });
});
