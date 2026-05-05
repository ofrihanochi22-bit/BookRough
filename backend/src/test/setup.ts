/**
 * Vitest global setup file — runs before every test file.
 *
 * Points Prisma at the dedicated test database (music_app_test) instead of
 * the dev database. This prevents integration tests from destroying real data.
 *
 * How it works: we set DATABASE_URL in process.env before any module that
 * imports `prisma.ts` is evaluated. Prisma reads the URL at client construction
 * time, so overriding it here is safe as long as this setup runs first.
 *
 * Also loads any .env.test overrides (optional file, not committed).
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.test if it exists (allows per-developer test overrides without changing tracked files)
dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: false });

// Ensure integration tests never touch the dev DB
if (process.env["TEST_DATABASE_URL"]) {
  process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"];
}
