import 'dotenv/config';
import { z } from 'zod';

/**
 * Every environment variable the backend reads, in one place.
 *
 * Phase 0 note: JWT_SECRET and GOOGLE_CLIENT_ID are declared here but nothing
 * consumes them yet — authentication is Step 1.3. They are required from the
 * start so that a developer configures their `.env` once, rather than
 * discovering a missing variable three steps later.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  // Must be a bare http(s) origin — scheme, host, optional port, nothing else.
  // `z.string().url()` alone is not enough: it accepts "localhost:5173", which
  // parses as the scheme "localhost", and cors() would then never match the
  // real browser origin.
  CORS_ORIGIN: z
    .string()
    .refine(
      (value) => {
        try {
          const url = new URL(value);
          return (
            (url.protocol === 'http:' || url.protocol === 'https:') &&
            url.hostname.length > 0 &&
            (url.pathname === '' || url.pathname === '/') &&
            url.search === '' &&
            url.hash === ''
          );
        } catch {
          return false;
        }
      },
      { message: 'CORS_ORIGIN must be a bare http(s) origin, e.g. http://localhost:5173' },
    )
    .default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Pure, testable parse. Throws with every offending variable named, so the
 * failure message is actionable rather than "invalid environment".
 */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration:\n${details}\n\nCopy backend/.env.example to backend/.env and fill in the missing values.`,
    );
  }

  return result.data;
}

function loadEnv(): Env {
  try {
    return parseEnv(process.env);
  } catch (error) {
    // Deliberately process.stderr and not the Pino logger: the logger itself is
    // configured from this module, so it cannot be trusted to exist yet.
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}

export const env = loadEnv();

/** Used to keep the test-only route off every other environment. */
export const isTest = env.NODE_ENV === 'test';
