/**
 * Singleton PrismaClient (Prisma 7 adapter pattern).
 *
 * Prisma 7 removed the `url` field from schema.prisma datasources.
 * Connection management now works through two mechanisms:
 *
 *   1. Migrations (CLI):  prisma.config.ts supplies the DATABASE_URL.
 *   2. Queries (runtime): we create a `pg.Pool` and pass it to PrismaClient
 *      via `@prisma/adapter-pg`. This gives us full control over the pool
 *      settings and makes the connection URL a runtime concern, not a
 *      compile-time one.
 *
 * The `globalThis` stash prevents `tsx --watch` hot reloads from opening a
 * new pool on every file change. Import `prisma` everywhere; never instantiate
 * PrismaClient elsewhere.
 *
 * NOTE: The generated client lives at `../../generated/prisma` (per schema.prisma
 * generator config), not at the usual `@prisma/client`.
 */

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { env } from "../config/env.js";

// Extend globalThis so TypeScript knows about the dev-mode stash
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __pgPool: pg.Pool | undefined;
}

function createPrismaClient(): PrismaClient {
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

export const prisma: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
