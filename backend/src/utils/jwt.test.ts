import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "./jwt.js";

describe("JWT helpers", () => {
  it("round-trips a userId through sign → verify", () => {
    const userId = "user-abc-123";
    const token = signSession(userId);
    const payload = verifySession(token);
    expect(payload.userId).toBe(userId);
  });

  it("throws on a tampered token", () => {
    const token = signSession("some-id");
    const tampered = token.slice(0, -4) + "XXXX";
    expect(() => verifySession(tampered)).toThrow();
  });

  it("throws on a completely invalid string", () => {
    expect(() => verifySession("not.a.jwt")).toThrow();
  });
});
