import { OAuth2Client } from 'google-auth-library';

import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('googleIdentity');
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
    // The library's message names the failed check (audience, expiry, …); it
    // does not echo the token's claims.
    log.warn({ reason: (error as Error).message }, 'Rejected Google ID token');
    throw new AppError(SIGN_IN_FAILED, 401);
  }

  if (!sub) {
    log.warn({ reason: 'missing sub' }, 'Rejected Google ID token');
    throw new AppError(SIGN_IN_FAILED, 401);
  }

  return { sub, picture: picture ?? null };
}
