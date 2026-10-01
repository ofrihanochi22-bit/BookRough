import { execSync } from 'node:child_process';

/**
 * Runs once before a suite that touches Postgres: applies every migration to
 * the test database (docs/tests.md §3.3). Each test file then wipes the rows it
 * needs empty — see `resetDatabase` in ./db.ts.
 *
 * The URL is resolved exactly as src/test/setup.ts does, so a developer's
 * `.env` (which points at the dev database) can never be the target.
 */
export default function setup(): void {
  const databaseUrl =
    process.env.DATABASE_URL ?? 'postgresql://bookrough:bookrough@localhost:5433/music_app_test_db';

  if (!databaseUrl.includes('test')) {
    throw new Error('Refusing to migrate: DATABASE_URL does not point at a test database.');
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
