import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { SESSION_TTL_SECONDS, shouldRenew, signSessionToken, verifySessionToken } from './jwt.js';

const USER_ID = '6f1c1c3e-3b1a-4a52-9f0e-2d7c1b0f4a11';
const DAY = 24 * 60 * 60;

describe('signSessionToken / verifySessionToken', () => {
  it('round-trips the user id with a 30-day lifetime', () => {
    // Arrange
    const token = signSessionToken(USER_ID);

    // Act
    const claims = verifySessionToken(token);

    // Assert
    expect(claims?.sub).toBe(USER_ID);
    expect(claims!.exp - claims!.iat).toBe(SESSION_TTL_SECONDS);
  });

  it('carries nothing but the standard claims — no role, no profile', () => {
    // Arrange
    const token = signSessionToken(USER_ID);

    // Act
    const decoded = jwt.decode(token) as Record<string, unknown>;

    // Assert
    expect(Object.keys(decoded).sort()).toEqual(['exp', 'iat', 'sub']);
  });

  it('rejects an expired token', () => {
    // Arrange
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign({ iat: now - 31 * DAY }, process.env.JWT_SECRET!, {
      subject: USER_ID,
      expiresIn: SESSION_TTL_SECONDS,
    });

    // Act & Assert
    expect(verifySessionToken(token)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    // Arrange
    const token = jwt.sign({}, 'some-other-secret-that-is-also-long-enough', {
      subject: USER_ID,
      expiresIn: SESSION_TTL_SECONDS,
    });

    // Act & Assert
    expect(verifySessionToken(token)).toBeNull();
  });

  it('rejects an unsigned (alg: none) token', () => {
    // Arrange
    const token = jwt.sign({ sub: USER_ID }, '', { algorithm: 'none' });

    // Act & Assert
    expect(verifySessionToken(token)).toBeNull();
  });

  it('rejects a validly signed token that has no subject', () => {
    // Arrange
    const token = jwt.sign({}, process.env.JWT_SECRET!, { expiresIn: SESSION_TTL_SECONDS });

    // Act & Assert
    expect(verifySessionToken(token)).toBeNull();
  });

  it('rejects garbage', () => {
    // Act & Assert
    expect(verifySessionToken('not-a-jwt')).toBeNull();
  });
});

describe('shouldRenew', () => {
  const iat = 1_000_000;
  const claims = { sub: USER_ID, iat, exp: iat + SESSION_TTL_SECONDS };

  it('is false before half the lifetime has passed', () => {
    // Act & Assert
    expect(shouldRenew(claims, iat + 14 * DAY)).toBe(false);
  });

  it('is true once more than 15 days have passed', () => {
    // Act & Assert
    expect(shouldRenew(claims, iat + 16 * DAY)).toBe(true);
  });
});
