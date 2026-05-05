/**
 * Integration tests for PATCH /api/users/me/onboarding (UC-1 Google signup).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDatabase } from "../test/db.js";
import { prisma } from "../db/prisma.js";

vi.mock("../services/email.service.js", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

const app = createApp();

async function createGoogleUser() {
  return prisma.user.create({
    data: {
      email: "google_user@gmail.com",
      username: "temp_user1234",
      displayName: "Google User",
      passwordHash: null,
      profileComplete: false,
    },
  });
}

async function loginAsGoogleUser(userId: string): Promise<string> {
  // Manually generate a session token for the test user
  const { signSession } = await import("../utils/jwt.js");
  return `bookrough_session=${signSession(userId)}`;
}

describe("PATCH /api/users/me/onboarding", () => {
  beforeEach(resetDatabase);

  it("completes onboarding and sets profileComplete to true", async () => {
    const user = await createGoogleUser();
    const cookie = await loginAsGoogleUser(user.id);

    const res = await request(app)
      .patch("/api/users/me/onboarding")
      .set("Cookie", cookie)
      .send({ username: "real_username", preferredService: "APPLE_MUSIC" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.user.username).toBe("real_username");
    expect(res.body.data.user.profileComplete).toBe(true);
    expect(res.body.data.user.preferredService).toBe("APPLE_MUSIC");
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it("returns 400 when username is already taken", async () => {
    // Create a user that owns the username
    await prisma.user.create({
      data: {
        email: "existing@example.com",
        username: "taken_name",
        displayName: "Existing",
        passwordHash: "hash",
      },
    });

    const user = await createGoogleUser();
    const cookie = await loginAsGoogleUser(user.id);

    const res = await request(app)
      .patch("/api/users/me/onboarding")
      .set("Cookie", cookie)
      .send({ username: "taken_name", preferredService: "SPOTIFY" });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("returns 401 without a session cookie", async () => {
    const res = await request(app)
      .patch("/api/users/me/onboarding")
      .send({ username: "newuser", preferredService: "SPOTIFY" });

    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid preferredService value", async () => {
    const user = await createGoogleUser();
    const cookie = await loginAsGoogleUser(user.id);

    const res = await request(app)
      .patch("/api/users/me/onboarding")
      .set("Cookie", cookie)
      .send({ username: "newuser", preferredService: "NAPSTER" });

    expect(res.status).toBe(400);
  });
});
