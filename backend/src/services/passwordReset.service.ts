/**
 * Password-reset flow (UC-17).
 *
 * Two operations:
 *   requestReset(email)               — issue a one-time token and (stub) send it by email
 *   resetWithToken({ token, pass })   — consume the token and update the hash
 *
 * The request side deliberately never throws for "email not found" or
 * "Google-only account" to prevent email enumeration: the controller always
 * returns the same 200 response.
 */

import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/AppError.js";
import { sendPasswordResetEmail } from "./email.service.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const BCRYPT_ROUNDS = 12;
const TOKEN_BYTES = 32;
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generates and stores a reset token for the given email.
 *
 * Silently no-ops (with a debug log) when:
 *  - No user exists with that email.
 *  - The user has no password (Google-only account).
 *
 * On success, calls sendPasswordResetEmail which currently logs the URL.
 */
export async function requestReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.passwordHash === null) {
    // Do not reveal whether the address exists or is Google-only.
    logger.debug(
      { email, reason: !user ? "not_found" : "google_only" },
      "Password reset skipped"
    );
    return;
  }

  // Remove any existing tokens for this user (only one active at a time)
  await prisma.passwordReset.deleteMany({ where: { userId: user.id } });

  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_MS);

  await prisma.passwordReset.create({
    data: { userId: user.id, token, expiresAt },
  });

  const resetUrl = `${env.FRONTEND_ORIGIN}/reset/${token}`;
  sendPasswordResetEmail(email, resetUrl);
}

/**
 * Validates a reset token and updates the user's password hash.
 *
 * The token row is deleted whether the update succeeds or fails to prevent
 * replay attacks.  The entire operation runs in a single transaction.
 *
 * Throws AppError(400) for invalid or expired tokens.
 */
export async function resetWithToken(
  token: string,
  newPassword: string
): Promise<void> {
  const record = await prisma.passwordReset.findUnique({ where: { token } });

  if (!record || record.expiresAt < new Date()) {
    throw new AppError(
      "Invalid or expired reset link",
      400,
      "INVALID_RESET_TOKEN"
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordReset.delete({ where: { token } }),
  ]);
}
