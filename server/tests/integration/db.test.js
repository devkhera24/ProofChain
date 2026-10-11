import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";

describe("test database harness", () => {
  useTestDb();

  it("health reports the in-memory database as connected", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.body.db).toBe("connected");
  });
});
