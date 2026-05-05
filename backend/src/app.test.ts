/**
 * Smoke tests for the Express application shell.
 *
 * These tests verify the foundational architecture — the health endpoint,
 * the error envelope shape, and the 404 handler — before any feature code
 * lands on top.
 *
 * We use `createApp()` directly (no `listen()`) and let Supertest manage the server.
 */

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

const app = createApp();

describe("GET /api/health", () => {
  it("returns 200 with the success envelope", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toMatchObject({
      status: "ok",
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    });
  });
});

describe("404 handler", () => {
  it("returns 404 with the error envelope for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: "error",
      code: 404,
      message: expect.any(String),
    });
  });
});
