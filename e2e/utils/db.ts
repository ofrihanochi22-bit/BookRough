/**
 * E2E database helper.
 *
 * Connects directly to the test DB and truncates all tables before each spec
 * so every Playwright test starts from a clean slate.
 *
 * Mirrors backend/src/test/db.ts but runs in the Playwright process context,
 * not in Vitest.
 *
 * Usage inside a spec:
 *   import { resetDatabase } from "../utils/db.js";
 *   test.beforeEach(resetDatabase);
 */

import pg from "pg";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const url =
      process.env["TEST_DATABASE_URL"] ??
      "postgres://bookrough:bookrough@localhost:5432/music_app_test_db";
    pool = new pg.Pool({ connectionString: url });
  }
  return pool;
}

export async function resetDatabase(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      TRUNCATE TABLE
        "password_resets",
        "users"
      CASCADE
    `);
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
