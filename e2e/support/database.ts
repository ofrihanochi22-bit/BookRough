import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * The admin role is set directly in the database, never through an API
 * (CLAUDE.md §17), so the suite does the same: one SQL statement through the
 * backend's own Prisma CLI, against the E2E test database. No new dependency.
 */
const BACKEND_DIR = fileURLToPath(new URL('../../backend', import.meta.url));
const LOCAL_TEST_DB = 'postgresql://bookrough:bookrough@localhost:5433/music_app_test_db';

export function makeAdmin(googleSub: string): void {
  // Only ids minted by newGoogleAccount reach the SQL text.
  if (!/^e2e-[0-9a-f]{32}$/.test(googleSub)) {
    throw new Error(`refusing an unexpected Google sub: ${googleSub}`);
  }
  execFileSync('npx', ['prisma', 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'], {
    cwd: BACKEND_DIR,
    input: `UPDATE "users" SET "role" = 'ADMIN' WHERE "google_sub" = '${googleSub}';`,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_TEST_DB },
    shell: process.platform === 'win32',
    stdio: ['pipe', 'ignore', 'inherit'],
  });
}
