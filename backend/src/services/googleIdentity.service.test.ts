import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../utils/AppError.js';
import { rejectionReason, verifyGoogleIdToken } from './googleIdentity.service.js';

const { getCerts, verifyIdToken } = vi.hoisted(() => ({
  getCerts: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    getFederatedSignonCertsAsync = getCerts;
    verifyIdToken = verifyIdToken;
  },
}));

function ticketWith(payload: Record<string, unknown> | undefined) {
  return { getPayload: () => payload };
}

beforeEach(() => {
  getCerts.mockReset().mockResolvedValue({});
  verifyIdToken.mockReset();
});

describe('verifyGoogleIdToken', () => {
  it('returns sub and picture, verified against our client id', async () => {
    // Arrange
    verifyIdToken.mockResolvedValue(
      ticketWith({ sub: 'sub-1', picture: 'https://pic', email: 'a@b.c', name: 'A B' }),
    );

    // Act
    const identity = await verifyGoogleIdToken('id-token');

    // Assert
    expect(identity).toEqual({ sub: 'sub-1', picture: 'https://pic' });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'id-token',
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  });

  it('returns a null picture when Google supplies none', async () => {
    // Arrange
    verifyIdToken.mockResolvedValue(ticketWith({ sub: 'sub-1' }));

    // Act & Assert
    await expect(verifyGoogleIdToken('id-token')).resolves.toEqual({ sub: 'sub-1', picture: null });
  });

  it('throws 503 when Google signing keys cannot be fetched', async () => {
    // Arrange
    getCerts.mockRejectedValue(new Error('getaddrinfo ENOTFOUND www.googleapis.com'));

    // Act & Assert
    await expect(verifyGoogleIdToken('id-token')).rejects.toMatchObject({ statusCode: 503 });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('throws 401 when verification fails', async () => {
    // Arrange
    verifyIdToken.mockRejectedValue(
      new Error('Wrong recipient, payload audience != requiredAudience'),
    );

    // Act
    const attempt = verifyGoogleIdToken('id-token');

    // Assert
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 when the payload has no sub', async () => {
    // Arrange
    verifyIdToken.mockResolvedValue(ticketWith({ picture: 'https://pic' }));

    // Act & Assert
    await expect(verifyGoogleIdToken('id-token')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 when there is no payload at all', async () => {
    // Arrange
    verifyIdToken.mockResolvedValue(ticketWith(undefined));

    // Act & Assert
    await expect(verifyGoogleIdToken('id-token')).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('rejectionReason', () => {
  it.each([
    ['Token used too late, 1 > 0: {"email":"x@y.z"}', 'expired'],
    ['Token used too early, 1 > 0: {"email":"x@y.z"}', 'not yet valid'],
    ['Invalid token signature: eyJ...', 'bad signature'],
    ['No pem found for envelope: {}', 'unknown signing key'],
    ['Wrong recipient, payload audience != requiredAudience', 'wrong audience'],
    ['Invalid issuer, expected one of [...]', 'wrong issuer'],
    ['Wrong number of segments in token: abc', 'malformed'],
    ["Can't parse token payload: eyJ...", 'malformed'],
    ['something new', 'other'],
  ])('maps "%s" to a fixed label with none of the message', (message, reason) => {
    // Act & Assert
    expect(rejectionReason(new Error(message))).toBe(reason);
  });

  it('labels a non-Error throw as "other"', () => {
    // Act & Assert
    expect(rejectionReason('a string')).toBe('other');
  });
});
