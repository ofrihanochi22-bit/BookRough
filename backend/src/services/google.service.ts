/**
 * Google OAuth token verification.
 *
 * Thin wrapper around google-auth-library so that the rest of the codebase
 * never imports Google SDK types directly.  Tests mock this module at the
 * module boundary, keeping them fast and offline-capable.
 */

import { OAuth2Client } from "google-auth-library";
import { AppError } from "../utils/AppError.js";
import { env } from "../config/env.js";

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export interface GoogleProfile {
  email: string;
  name: string;
  picture: string;
  sub: string;
}

/**
 * Verifies a Google ID token issued to this app's client ID.
 *
 * Returns the verified profile fields on success.
 * Throws AppError(401) on any verification failure (expired, wrong audience, etc.).
 */
export async function verifyGoogleIdToken(
  idToken: string
): Promise<GoogleProfile> {
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.sub) {
      throw new Error("Missing required fields in Google token payload");
    }

    return {
      email: payload.email,
      name: payload.name ?? payload.email,
      picture: payload.picture ?? "",
      sub: payload.sub,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("Invalid Google token", 401, "INVALID_GOOGLE_TOKEN");
  }
}
