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
    // Case and surrounding spaces are forgiven, and blank means "not set": a
    // level typed as "Info" at a host's dashboard once stopped the whole API
    // (production-deploy.md §9).
    LOG_LEVEL: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim().toLowerCase() || undefined : value),
      z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    ),
    // How many proxies sit in front of the server (production-hardening.md
    // §3.2). 0 locally and in CI; 1 behind a host's proxy, so `req.ip` is the
    // client's address and not the proxy's. Too high would let a client spoof
    // its address through X-Forwarded-For.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // E2E only (production-hardening.md §3.1): the suite signs in dozens of
    // times from one address. Only "true" switches the limits off.
    // Case and spaces are forgiven, and anything but "true" means off, so a
    // value typed at a dashboard can't stop the API (as LOG_LEVEL once did).
    RATE_LIMITS_DISABLED: z
      .string()
      .optional()
      .transform((value) => value?.trim().toLowerCase() === 'true'),
    // The onboarding tutorial (docs/features/onboarding-tutorial.md §4): only
    // "false" switches it off for every user of this environment — local E2E
    // and CI set it. Unset, or anything else, means on. Allowed in every mode:
    // it hides help, it opens nothing.
    TUTORIAL_ENABLED: z
      .string()
      .optional()
      .transform((value) => value?.trim().toLowerCase() !== 'false'),
    // E2E only (docs/features/auth-flow-e2e.md): an RSA public key that stands
    // in for Google's. Escaped "\n" sequences are accepted so a PEM fits on
    // one line. Empty means "not set".
    E2E_GOOGLE_PUBLIC_KEY: z
      .string()
      .optional()
      .transform((value) => (value ? value.replace(/\\n/g, '\n').trim() : undefined)),
    // E2E only (docs/features/posts-feed.md §4.2): a JSON file of canned link
    // conversions that replaces the real squigly.link scraper. Empty means
    // "not set".
    E2E_SCRAPER_FIXTURES: z
      .string()
      .optional()
      .transform((value) => value || undefined),
  })
  // The stand-in must be impossible to enable on the real server, not merely
  // discouraged: with it, anyone holding the committed test key could sign in
  // as anyone. It is allowed only under NODE_ENV=test (the one mode E2E uses),
  // so a host that forgets NODE_ENV — which defaults to development — is still
  // refused.
  .refine((env) => !env.E2E_GOOGLE_PUBLIC_KEY || env.NODE_ENV === 'test', {
    path: ['E2E_GOOGLE_PUBLIC_KEY'],
    message: 'is only allowed with NODE_ENV=test — it replaces Google sign-in verification',
  })
  // Same reasoning: canned conversions must never reach real users' posts.
  .refine((env) => !env.E2E_SCRAPER_FIXTURES || env.NODE_ENV === 'test', {
    path: ['E2E_SCRAPER_FIXTURES'],
    message: 'is only allowed with NODE_ENV=test — it replaces the link converter',
  })
  // Same rule as the stand-ins, and refused rather than ignored: a server that
  // starts without its rate limits is the failure this exists to stop.
  .refine((env) => !env.RATE_LIMITS_DISABLED || env.NODE_ENV === 'test', {
    path: ['RATE_LIMITS_DISABLED'],
    message: 'is only allowed with NODE_ENV=test — it switches off rate limiting',
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
