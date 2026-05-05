/**
 * Integration tests for POST /api/auth/google.
 *
 * The Google token verification is mocked at the module level so tests run
 * offline and fast.  The rest (find-or-create user, cookie issue) hits the
 * real test database.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDatabase } from "../test/db.js";

// Mock google.service before the app module imports it
vi.mock("../services/google.service.js", () => ({
  verifyGoogleIdToken: vi.fn(),
}));

// Import the mock after vi.mock is registered
const { verifyGoogleIdToken } = await import("../services/google.service.js");
const mockVerify = vi.mocked(verifyGoogleIdToken);

const app = createApp();

const GOOGLE_PROFILE = {
  email: "bob@gmail.com",
  name: "Bob Builder",
  picture: "https://lh3.googleusercontent.com/bob.jpg",
  sub: "google-uid-bob-123",
};

describe("POST /api/auth/google", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetAllMocks();
  });

  it("creates a new Google user and returns requiresOnboarding: true", async () => {
    mockVerify.mockResolvedValueOnce(GOOGLE_PROFILE);

    const res = await request(app)
      .post("/api/auth/google")
      .send({ idToken: "valid-google-token" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.user.email).toBe(GOOGLE_PROFILE.email);
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.requiresOnboarding).toBe(true);

    const cookie = res.headers["set-cookie"] as string[] | string | undefined;
    expect(cookie).toBeDefined();
  });

  it("reuses an existing user on second Google login", async () => {
    mockVerify.mockResolvedValue(GOOGLE_PROFILE);

    // First login — creates the user
    const first = await request(app)
      .post("/api/auth/google")
      .send({ idToken: "token1" });
    expect(first.status).toBe(200);
    const firstId = first.body.data.user.id as string;

    // Second login — should reuse the same user row
    const second = await request(app)
      .post("/api/auth/google")
      .send({ idToken: "token2" });
    expect(second.status).toBe(200);
    expect(second.body.data.user.id).toBe(firstId);
  });

  it("returns 401 when the Google token is invalid", async () => {
    const { AppError } = await import("../utils/AppError.js");
    mockVerify.mockRejectedValueOnce(
      new AppError("Invalid Google token", 401, "INVALID_GOOGLE_TOKEN")
    );

    const res = await request(app)
      .post("/api/auth/google")
      .send({ idToken: "bad-token" });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("error");
  });

  it("returns 400 when idToken is missing from the body", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({});

    expect(res.status).toBe(400);
  });
});
