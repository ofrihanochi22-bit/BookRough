import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('googleIdentity');

// Straight to stderr, not the logger: the stand-in only runs under
// NODE_ENV=test, where the logger is silent.
if (env.E2E_GOOGLE_PUBLIC_KEY) {
  process.stderr.write(
    'WARNING: E2E Google stand-in is active — ID tokens are verified with the test key, not Google.\n',
  );
}

const client = new OAuth2Client();

const SIGN_IN_FAILED = 'Google sign-in failed. Please try again.';
const GOOGLE_UNAVAILABLE = 'Google sign-in is temporarily unavailable.';

/** The only two facts this project keeps from a Google identity token. */
export interface GoogleIdentity {
  sub: string;
  picture: string | null;
}

/**
 * Verifies a Google ID token (signature, audience, issuer, expiry) and returns
 * its `sub` and `picture`.
 *
 * The token also carries `email` and `name`. They are deliberately never read
 * into anything that outlives this function — not returned, not logged
 * (CLAUDE.md §5).
 *
 * Google's signing keys are fetched first, on their own, so that "Google is
 * unreachable" (503) can be told apart from "this token is bad" (401). The
 * library caches the keys, so verification does not hit the network again.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  if (env.E2E_GOOGLE_PUBLIC_KEY) {
    return verifyWithStandIn(idToken, env.E2E_GOOGLE_PUBLIC_KEY);
  }

  try {
    await client.getFederatedSignonCertsAsync();
  } catch (error) {
    log.error({ reason: (error as Error).message }, 'Could not fetch Google signing keys');
    throw new AppError(GOOGLE_UNAVAILABLE, 503);
  }

  let sub: string | undefined;
  let picture: string | undefined;

  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    sub = payload?.sub;
    picture = payload?.picture;
  } catch (error) {
    log.warn({ reason: rejectionReason(error) }, 'Rejected Google ID token');
    throw new AppError(SIGN_IN_FAILED, 401);
  }

  if (!sub) {
    log.warn({ reason: 'missing sub' }, 'Rejected Google ID token');
    throw new AppError(SIGN_IN_FAILED, 401);
  }

  return { sub, picture: picture ?? null };
}

/**
 * google-auth-library's error messages embed the raw token or its decoded
 * payload — email and name included ("Token used too late, …: {payload}").
 * They must never reach a log (CLAUDE.md §5), so only a fixed label derived
 * from the message is logged, never the message itself.
 */
const REJECTION_REASONS: ReadonlyArray<[prefix: string, reason: string]> = [
  ['Token used too late', 'expired'],
  ['Token used too early', 'not yet valid'],
  ['Invalid token signature', 'bad signature'],
  ['No pem found', 'unknown signing key'],
  ['Wrong recipient', 'wrong audience'],
  ['Invalid issuer', 'wrong issuer'],
  ['Wrong number of segments', 'malformed'],
  ["Can't parse token", 'malformed'],
];

export function rejectionReason(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const match = REJECTION_REASONS.find(([prefix]) => message.startsWith(prefix));
  return match ? match[1] : 'other';
}

/**
 * E2E only (docs/features/auth-flow-e2e.md): the same checks Google's tokens
 * get — signature, audience, issuer, expiry — against the committed test key.
 * The env schema refuses to boot production with this key set.
 */
function verifyWithStandIn(idToken: string, publicKey: string): GoogleIdentity {
  try {
    const payload = jwt.verify(idToken, publicKey, {
      algorithms: ['RS256'],
      audience: env.GOOGLE_CLIENT_ID,
      issuer: 'https://accounts.google.com',
    });
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || payload.sub === '') {
      throw new Error('missing sub');
    }
    const picture: unknown = payload.picture;
    return { sub: payload.sub, picture: typeof picture === 'string' ? picture : null };
  } catch (error) {
    log.warn({ reason: (error as Error).name }, 'Rejected stand-in ID token');
    throw new AppError(SIGN_IN_FAILED, 401);
  }
}
