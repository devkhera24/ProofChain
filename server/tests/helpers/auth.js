import request from "supertest";

export async function registerAndLogin(app, overrides = {}) {
  const body = { name: "Test User", email: `u${Date.now()}${Math.random()}@test.dev`, password: "password123", ...overrides };
  const res = await request(app).post("/api/auth/register").send(body);
  return { token: res.body.token, user: res.body.user, auth: { Authorization: `Bearer ${res.body.token}` } };
}
