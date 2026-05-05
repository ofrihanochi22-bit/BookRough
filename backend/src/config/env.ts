/**
 * Environment configuration — the ONLY place process.env is read.
 *
 * Validated at startup with Zod. If a required variable is missing or
 * malformed, the process throws before Express even starts so the error
 * is obvious rather than surfacing as a runtime crash later.
 *
 * Import `env` from this file everywhere; never read process.env directly.
 */

import { z } from "zod";
import dotenv from "dotenv";

// Load the .env file before validation (safe no-op in production)
dotenv.config();

const envSchema = z.object({
  // ── Server ──────────────────────────────────────────────────────────────
  PORT: z
    .string()
    .default("4000")
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // ── Database ─────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid postgres:// URL"),
  TEST_DATABASE_URL: z
    .string()
    .url("TEST_DATABASE_URL must be a valid postgres:// URL")
    .optional(),

  // ── Auth ──────────────────────────────────────────────────────────────────
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters — generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""),
  JWT_EXPIRES_IN: z.string().default("7d"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),

  // ── Cookies ───────────────────────────────────────────────────────────────
  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  COOKIE_DOMAIN: z.string().optional(),

  // ── CORS ──────────────────────────────────────────────────────────────────
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),

  // ── Logging ───────────────────────────────────────────────────────────────
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("❌  Invalid environment variables:\n");
  result.error.issues.forEach((issue) => {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;
