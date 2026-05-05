/**
 * Authentication business logic.
 *
 * This module is deliberately decoupled from Express — it receives plain data,
 * talks to the DB via Prisma, and either returns a result or throws an AppError.
 * Controllers handle request/response; this file handles rules.
 *
 * Never import `req` or `res` here.
 */

import bcrypt from "bcrypt";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/AppError.js";
import type { RegisterInput } from "../validation/auth.schema.js";
import type { User } from "../../generated/prisma/client.js";

const BCRYPT_ROUNDS = 12;

/** User shape returned to callers — always omits the password hash. */
export type SafeUser = Omit<User, "passwordHash">;

function stripHash(user: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _hash, ...safe } = user;
  return safe;
}

/**
 * Creates a new user with an email+password credential.
 *
 * Throws AppError(400) if the email or username is already taken.
 * The Prisma P2002 unique-constraint error is caught and converted.
 */
export async function registerWithPassword(
  input: RegisterInput
): Promise<SafeUser> {
  const { email, username, displayName, password, preferredService } = input;

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { email, username, displayName, passwordHash, preferredService },
    });
    return stripHash(user);
  } catch (err: unknown) {
    // P2002 = unique constraint violation
    if (isPrismaError(err, "P2002")) {
      const fields = (err as PrismaKnownError).meta?.["target"] as
        | string[]
        | undefined;
      const which = fields?.includes("email") ? "Email" : "Username";
      throw new AppError(`${which} is already taken`, 400, "DUPLICATE_FIELD");
    }
    throw err;
  }
}

/**
 * Validates email+password credentials.
 *
 * Returns the safe user on success.
 * Throws AppError(401) for any auth failure (including Google-only accounts
 * that have no password).  The same message is used for both cases to avoid
 * leaking which field is wrong.
 */
export async function loginWithPassword(
  email: string,
  password: string
): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  return stripHash(user);
}

/**
 * Returns a user by ID, without the password hash.
 * Throws AppError(401) if the user no longer exists (e.g. deleted account).
 */
export async function getUserById(id: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new AppError("User not found", 401, "UNAUTHORIZED");
  }
  return stripHash(user);
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

interface GoogleUserInput {
  email: string;
  name: string;
  picture: string;
}

/**
 * Finds an existing user by email or creates a new Google-authenticated user.
 *
 * New users are created with:
 *   - `passwordHash: null`  (they cannot log in with a password)
 *   - `profileComplete: false`  (they must complete the onboarding form)
 *   - a derived username (lowercased name + 4-digit suffix, retried on collision)
 */
export async function loginOrCreateGoogleUser(
  input: GoogleUserInput
): Promise<SafeUser> {
  const { email, name, picture } = input;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return stripHash(existing);
  }

  // Derive a candidate username; retry with a new suffix on collision (up to 5×)
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = Math.floor(1000 + Math.random() * 9000).toString();
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 16);
    const username = `${base}${suffix}`;

    try {
      const user = await prisma.user.create({
        data: {
          email,
          username,
          displayName: name,
          profilePictureUrl: picture || undefined,
          passwordHash: null,
          profileComplete: false,
        },
      });
      return stripHash(user);
    } catch (err: unknown) {
      if (isPrismaError(err, "P2002")) {
        continue; // username collision — try again with a new suffix
      }
      throw err;
    }
  }

  throw new AppError(
    "Could not generate a unique username. Please try again.",
    500,
    "USERNAME_GENERATION_FAILED"
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface PrismaKnownError {
  code: string;
  meta?: Record<string, unknown>;
}

function isPrismaError(err: unknown, code: string): err is PrismaKnownError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as PrismaKnownError).code === code
  );
}
