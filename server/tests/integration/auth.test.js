import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { useTestDb } from "../helpers/db.js";
import { registerAndLogin } from "../helpers/auth.js";

const app = createApp();
const body = { name: "Ada Lovelace", email: "Ada@Example.com", password: "password123" };

describe("auth", () => {
  useTestDb();

  it("registers a user and returns a token without the password hash", async () => {
    const res = await request(app).post("/api/auth/register").send(body);
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: "Ada Lovelace", email: "ada@example.com", id: expect.any(String) });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(res.body.user).not.toHaveProperty("_id");
  });

  it("rejects a duplicate email with 409 (case-insensitive)", async () => {
    await request(app).post("/api/auth/register").send(body);
    const res = await request(app).post("/api/auth/register").send({ ...body, email: "ADA@example.com" });
    expect(res.status).toBe(409);
  });

  it("rejects a short password with 400 and issues", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...body, password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: "password" })]));
  });

  it("logs in with the right password and rejects a wrong one with 401", async () => {
    await request(app).post("/api/auth/register").send(body);
    const ok = await request(app).post("/api/auth/login").send({ email: body.email, password: body.password });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toEqual(expect.any(String));
    expect(ok.body.user).not.toHaveProperty("passwordHash");

    const bad = await request(app).post("/api/auth/login").send({ email: body.email, password: "wrong-password" });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe("Invalid email or password");
  });

  it("returns 401 from /me without a token or with a bad token", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("returns the current user from /me with a valid token", async () => {
    const { auth, user } = await registerAndLogin(app);
    const res = await request(app).get("/api/auth/me").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, email: user.email });
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });
});
