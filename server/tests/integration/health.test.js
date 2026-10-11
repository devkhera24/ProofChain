import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(createApp()).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Route not found/);
  });
});
