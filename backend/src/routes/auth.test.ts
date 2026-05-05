/**
 * Integration tests for the auth routes.
 *
 * Each test hits the real Express app + the test database (music_app_test).
 * `resetDatabase()` wipes all tables before every test so tests are independent.
 *
 * Supertest is used to issue HTTP requests; the cookie jar is managed manually
 * so we can verify the Set-Cookie header and replay the token.
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDatabase } from "../test/db.js";

const app = createApp();

const VALID_USER = {
  email: "alice@example.com",
  username: "alice_dev",
  displayName: "Alice",
  password: "Password1",
  preferredService: "SPOTIFY",
} as const;

describe("POST /api/auth/register", () => {
  beforeEach(resetDatabase);

  it("returns 201 with user data and sets a session cookie", async () => {
    const res = await request(app).post("/api/auth/register").send(VALID_USER);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data.user.email).toBe(VALID_USER.email);
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const cookie = res.headers["set-cookie"] as string[] | string | undefined;
    expect(cookie).toBeDefined();
    const cookieStr = Array.isArray(cookie) ? cookie.join(";") : cookie;
    expect(cookieStr).toContain("bookrough_session");
  });

  it("returns 400 on duplicate email", async () => {
    await request(app).post("/api/auth/register").send(VALID_USER);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_USER, username: "alice2" });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("returns 400 on duplicate username", async () => {
    await request(app).post("/api/auth/register").send(VALID_USER);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_USER, email: "alice2@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("returns 400 when password is too weak", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_USER, password: "short" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await resetDatabase();
    await request(app).post("/api/auth/register").send(VALID_USER);
  });

  it("returns 200 with user and sets a session cookie on correct credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: VALID_USER.email, password: VALID_USER.password });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(VALID_USER.email);
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const cookie = res.headers["set-cookie"] as string[] | string | undefined;
    expect(cookie).toBeDefined();
  });

  it("returns 401 on wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: VALID_USER.email, password: "WrongPass9" });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("error");
  });

  it("returns 401 on unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: VALID_USER.password });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 200 and clears the session cookie", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(200);
    const cookie = res.headers["set-cookie"] as string[] | string | undefined;
    // clearCookie sends a Set-Cookie with an expired date
    const cookieStr = Array.isArray(cookie) ? cookie.join(";") : (cookie ?? "");
    expect(cookieStr).toContain("bookrough_session");
    expect(cookieStr).toContain("Expires=");
  });
});

describe("GET /api/auth/me", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("returns 401 when no cookie is sent", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user when a valid cookie is sent", async () => {
    // Register and grab the session cookie
    const regRes = await request(app)
      .post("/api/auth/register")
      .send(VALID_USER);

    const cookies = regRes.headers["set-cookie"] as string[] | string;
    const cookieHeader = Array.isArray(cookies) ? cookies.join(";") : cookies;

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookieHeader);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe(VALID_USER.email);
    expect(meRes.body.data.user.passwordHash).toBeUndefined();
  });
});
