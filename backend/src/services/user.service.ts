/**
 * User-related business logic.
 *
 * Handles user mutations that don't belong to the auth flow (onboarding
 * completion, future avatar updates, etc.).  Like auth.service, this module
 * is decoupled from Express — it receives plain data and returns plain data
 * or throws AppError.
 */

import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/AppError.js";
import type { SafeUser } from "./auth.service.js";
import type { User } from "../../generated/prisma/client.js";

function stripHash(user: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _hash, ...safe } = user;
  return safe;
}

/**
 * Marks a Google-signup user's profile as complete after the onboarding step.
 *
 * Sets the chosen username and preferred service, then flips `profileComplete`
 * to `true` so `RequireAuth` stops redirecting them to `/onboarding`.
 *
 * Throws AppError(400) if the username is already taken (P2002).
 */
export async function completeOnboarding(
  userId: string,
  input: { username: string; preferredService: string }
): Promise<SafeUser> {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        username: input.username,
        preferredService: input.preferredService as never,
        profileComplete: true,
      },
    });
    return stripHash(user);
  } catch (err: unknown) {
    if (isPrismaError(err, "P2002")) {
      throw new AppError("Username is already taken", 400, "DUPLICATE_FIELD");
    }
    throw err;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface PrismaKnownError {
  code: string;
}

function isPrismaError(err: unknown, code: string): err is PrismaKnownError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as PrismaKnownError).code === code
  );
}
