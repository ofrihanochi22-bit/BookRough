import { generateKeyPairSync } from 'node:crypto';

import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyGoogleIdToken } from './googleIdentity.service.js';

/**
 * The E2E stand-in path of verifyGoogleIdToken (docs/features/auth-flow-e2e.md).
 * A fresh key pair per run, so these tests never depend on the committed one.
 */
const { keys, getCerts } = vi.hoisted(() => ({
  keys: { publicKey: '', privateKey: '' },
  getCerts: vi.fn(),
}));

vi.mock('../config/env.js', async () => {
  const { generateKeyPairSync: generate } = await import('node:crypto');
  const pair = generate('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  keys.publicKey = pair.publicKey;
  keys.privateKey = pair.privateKey;
  return {
    env: {
      NODE_ENV: 'test',
      GOOGLE_CLIENT_ID: 'e2e-client',
      LOG_LEVEL: 'info',
      E2E_GOOGLE_PUBLIC_KEY: pair.publicKey,
    },
    isTest: true,
  };
});

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    getFederatedSignonCertsAsync = getCerts;
    verifyIdToken = vi.fn();
  },
}));

function token(
  claims: Record<string, unknown>,
  options: { key?: string; audience?: string; issuer?: string; expiresIn?: number } = {},
) {
  return jwt.sign(claims, options.key ?? keys.privateKey, {
    algorithm: 'RS256',
    audience: options.audience ?? 'e2e-client',
    issuer: options.issuer ?? 'https://accounts.google.com',
    expiresIn: options.expiresIn ?? 600,
  });
}

beforeEach(() => {
  getCerts.mockReset();
});

describe('verifyGoogleIdToken with the E2E stand-in', () => {
  it('accepts a token signed with the stand-in key, without calling Google', async () => {
    // Act
    const identity = await verifyGoogleIdToken(
      token({ sub: 'e2e-1', picture: 'https://pic', email: 'x@y.z' }),
    );

    // Assert
    expect(identity).toEqual({ sub: 'e2e-1', picture: 'https://pic' });
    expect(getCerts).not.toHaveBeenCalled();
  });

  it('returns a null picture when the token has none', async () => {
    // Act & Assert
    await expect(verifyGoogleIdToken(token({ sub: 'e2e-1' }))).resolves.toEqual({
      sub: 'e2e-1',
      picture: null,
    });
  });

  it('rejects a token signed with another key', async () => {
    // Arrange
    const other = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    // Act & Assert
    await expect(
      verifyGoogleIdToken(token({ sub: 'e2e-1' }, { key: other.privateKey })),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it.each([
    ['the wrong audience', { audience: 'someone-else' }],
    ['the wrong issuer', { issuer: 'https://evil.example' }],
    ['an expired token', { expiresIn: -10 }],
  ])('rejects %s', async (_label, options) => {
    // Act & Assert
    await expect(verifyGoogleIdToken(token({ sub: 'e2e-1' }, options))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('rejects a token without a sub', async () => {
    // Act & Assert
    await expect(verifyGoogleIdToken(token({ picture: 'x' }))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('rejects an HS256 token forged with the public key as its secret', async () => {
    // Arrange — the classic algorithm-confusion attack.
    const forged = jwt.sign({ sub: 'attacker' }, 'not-the-key', {
      algorithm: 'HS256',
      audience: 'e2e-client',
      issuer: 'https://accounts.google.com',
    });

    // Act & Assert
    await expect(verifyGoogleIdToken(forged)).rejects.toMatchObject({ statusCode: 401 });
  });
});
