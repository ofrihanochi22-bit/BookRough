/**
 * Test database helpers.
 *
 * Integration tests must call `resetDatabase()` in a `beforeEach` (or `beforeAll`)
 * so each test suite starts from a clean slate.
 *
 * Tables are truncated in dependency order (children before parents) to avoid
 * foreign-key constraint violations. Update this list when new tables are added.
 *
 * Usage in a test file:
 *   import { resetDatabase } from '../test/db.js';
 *   beforeEach(resetDatabase);
 */

import { prisma } from "../db/prisma.js";

export async function resetDatabase(): Promise<void> {
  // Truncate in reverse-dependency order (deepest child tables first)
  await prisma.$transaction([
    prisma.$executeRaw`TRUNCATE TABLE "bookmarks"   CASCADE`,
    prisma.$executeRaw`TRUNCATE TABLE "ratings"     CASCADE`,
    prisma.$executeRaw`TRUNCATE TABLE "posts"       CASCADE`,
    prisma.$executeRaw`TRUNCATE TABLE "friends"     CASCADE`,
    prisma.$executeRaw`TRUNCATE TABLE "community_members" CASCADE`,
    prisma.$executeRaw`TRUNCATE TABLE "communities" CASCADE`,
    prisma.$executeRaw`TRUNCATE TABLE "password_resets" CASCADE`,
    prisma.$executeRaw`TRUNCATE TABLE "users"       CASCADE`,
  ]);
}
