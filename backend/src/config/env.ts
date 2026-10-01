import 'dotenv/config';
import { z } from 'zod';

/**
 * Every environment variable the backend reads, in one place.
 */
const envSchema = z
  .object({
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
    // E2E only (docs/features/auth-flow-e2e.md): an RSA public key that stands
    // in for Google's. Escaped "\n" sequences are accepted so a PEM fits on
    // one line. Empty means "not set".
    E2E_GOOGLE_PUBLIC_KEY: z
      .string()
      .optional()
      .transform((value) => (value ? value.replace(/\\n/g, '\n').trim() : undefined)),
  })
  // The stand-in must be impossible to enable on the real server, not merely
  // discouraged: with it, anyone holding the committed test key could sign in
  // as anyone.
  .refine((env) => !(env.NODE_ENV === 'production' && env.E2E_GOOGLE_PUBLIC_KEY), {
    path: ['E2E_GOOGLE_PUBLIC_KEY'],
    message: 'must not be set in production — it replaces Google sign-in verification',
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
