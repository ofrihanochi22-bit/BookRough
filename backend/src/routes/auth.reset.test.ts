/**
 * Integration tests for the password-reset flow (UC-17).
 *
 * Covers:
 *  - POST /api/auth/forgot  — always 200, regardless of whether the email exists
 *  - POST /api/auth/reset   — happy path consumes the token; bad token → 400
 *
 * The email service is mocked so no actual emails are sent.
 * The test DB is reset before each test for isolation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDatabase } from "../test/db.js";
import { prisma } from "../db/prisma.js";

// Silence the email stub so stdout stays clean in tests
vi.mock("../services/email.service.js", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

const app = createApp();

const VALID_USER = {
  email: "carol@example.com",
  username: "carol_test",
  displayName: "Carol",
  password: "Password1",
  preferredService: "SPOTIFY",
} as const;

async function registerUser() {
  await request(app).post("/api/auth/register").send(VALID_USER);
}

async function getResetToken(email: string): Promise<string> {
  const row = await prisma.passwordReset.findFirst({
    where: { user: { email } },
  });
  if (!row) throw new Error("No reset token found in DB");
  return row.token;
}

describe("POST /api/auth/forgot", () => {
  beforeEach(async () => {
    await resetDatabase();
    await registerUser();
  });

  it("returns 200 for a valid email (happy path)", async () => {
    const res = await request(app)
      .post("/api/auth/forgot")
      .send({ email: VALID_USER.email });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.message).toContain("reset link");
  });

  it("returns the same 200 for an unknown email (enumeration prevention)", async () => {
    const res = await request(app)
      .post("/api/auth/forgot")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
  });

  it("creates a password_reset row for a valid email", async () => {
    await request(app)
      .post("/api/auth/forgot")
      .send({ email: VALID_USER.email });

    const token = await getResetToken(VALID_USER.email);
    expect(token).toHaveLength(64); // 32 bytes → 64 hex chars
  });

  it("does not create a reset row for a Google-only account", async () => {
    // Create a Google-only user (passwordHash = null)
    await prisma.user.create({
      data: {
        email: "googleuser@gmail.com",
        username: "googleuser1",
        displayName: "Google User",
        passwordHash: null,
        profileComplete: false,
      },
    });

    await request(app)
      .post("/api/auth/forgot")
      .send({ email: "googleuser@gmail.com" });

    const row = await prisma.passwordReset.findFirst({
      where: { user: { email: "googleuser@gmail.com" } },
    });
    expect(row).toBeNull();
  });
});

describe("POST /api/auth/reset", () => {
  beforeEach(async () => {
    await resetDatabase();
    await registerUser();
    // Issue a reset token
    await request(app)
      .post("/api/auth/forgot")
      .send({ email: VALID_USER.email });
  });

  it("resets the password with a valid token and allows login with new password", async () => {
    const token = await getResetToken(VALID_USER.email);

    const resetRes = await request(app)
      .post("/api/auth/reset")
      .send({ token, newPassword: "NewPass99" });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.status).toBe("success");

    // Old password should no longer work
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: VALID_USER.email, password: VALID_USER.password });
    expect(oldLogin.status).toBe(401);

    // New password should work
    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: VALID_USER.email, password: "NewPass99" });
    expect(newLogin.status).toBe(200);
  });

  it("returns 400 for an invalid token", async () => {
    const res = await request(app)
      .post("/api/auth/reset")
      .send({ token: "not-a-real-token", newPassword: "NewPass99" });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("returns 400 if the token is expired", async () => {
    const token = await getResetToken(VALID_USER.email);

    // Backdate the expiry to simulate expiration
    await prisma.passwordReset.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post("/api/auth/reset")
      .send({ token, newPassword: "NewPass99" });

    expect(res.status).toBe(400);
  });

  it("burns the token after a successful reset (cannot be reused)", async () => {
    const token = await getResetToken(VALID_USER.email);

    await request(app)
      .post("/api/auth/reset")
      .send({ token, newPassword: "NewPass99" });

    // Second attempt with the same token
    const secondRes = await request(app)
      .post("/api/auth/reset")
      .send({ token, newPassword: "AnotherPass1" });

    expect(secondRes.status).toBe(400);
  });
});
