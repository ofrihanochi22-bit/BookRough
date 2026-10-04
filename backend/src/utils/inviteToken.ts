import { randomBytes } from 'node:crypto';

/**
 * Invite tokens — docs/features/communities-invites.md §3: 128 random bits,
 * base64url (22 characters). Unguessable, so the public preview needs no rate
 * limit to stay safe from enumeration.
 */
export function generateInviteToken(): string {
  return randomBytes(16).toString('base64url');
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * True for anything that could be a token. Callers treat a malformed token
 * exactly like an unknown one, so a link holder cannot tell a typo from a reset.
 */
export function hasInviteTokenShape(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_SHAPE.test(value);
}
