/**
 * Runs before every test file, both suites.
 *
 * Supplies the environment the app validates at import time so that a test run
 * never depends on a developer's `.env`. These values are fake by design: the
 * secret is throwaway, and the database URL points at music_app_test_db, never
 * at the development database (docs/tests.md §3.3).
 */
process.env.NODE_ENV = 'test';
process.env.PORT ??= '4001';
process.env.DATABASE_URL ??=
  'postgresql://bookrough:bookrough@localhost:5432/music_app_test_db';
process.env.JWT_SECRET ??= 'test-secret-value-that-is-long-enough-to-pass-validation';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id.apps.googleusercontent.com';
process.env.CORS_ORIGIN ??= 'http://localhost:5173';
