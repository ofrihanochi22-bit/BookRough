import type { Request, RequestHandler } from 'express';
import { MemoryStore, rateLimit } from 'express-rate-limit';

import { env, isTest } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('rateLimits');

const MINUTE = 60_000;

/** The four tiers of docs/features/production-hardening.md §3.1. */
export type RateLimitTier = 'conversion' | 'signIn' | 'outreach' | 'global';

interface TierRule {
  windowMs: number;
  limit: number;
  message: string;
  /** Signed-in tiers count the account, so friends on one Wi-Fi don't share a counter. */
  byUser: boolean;
}

export const RATE_LIMIT_RULES: Record<RateLimitTier, TierRule> = {
  // Each request can hold a Chromium for up to 12 s (CLAUDE.md §7).
  conversion: {
    windowMs: 10 * MINUTE,
    limit: 10,
    message: "You're sharing links too fast. Try again in a few minutes.",
    byUser: true,
  },
  signIn: {
    windowMs: 15 * MINUTE,
    limit: 10,
    message: 'Too many sign-in attempts. Try again in a few minutes.',
    byUser: false,
  },
  // Requests that land in someone else's app: friend requests, invitations.
  outreach: {
    windowMs: 60 * MINUTE,
    limit: 30,
    message: "You've sent a lot of requests. Try again later.",
    byUser: true,
  },
  global: {
    windowMs: MINUTE,
    limit: 300,
    message: 'Too many requests. Slow down and try again shortly.',
    byUser: false,
  },
};

/** One store per tier, in this instance's memory (production-hardening.md §3.1). */
const stores: Record<RateLimitTier, MemoryStore> = {
  conversion: new MemoryStore(),
  signIn: new MemoryStore(),
  outreach: new MemoryStore(),
  global: new MemoryStore(),
};

let enabled = !env.RATE_LIMITS_DISABLED;

function userKey(req: Request): string {
  // Only ever mounted after requireAuth, which sets req.user or answers 401.
  return `user:${req.user!.id}`;
}

function buildLimiter(tier: RateLimitTier): RequestHandler {
  const rule = RATE_LIMIT_RULES[tier];
  const limiter = rateLimit({
    windowMs: rule.windowMs,
    limit: rule.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: stores[tier],
    // The IP tiers keep the library's default key, which groups IPv6
    // addresses by subnet; it reads req.ip, so `trust proxy` must be right.
    ...(rule.byUser ? { keyGenerator: userKey } : {}),
    skip: (req) => tier === 'global' && req.path === '/health',
    // The central error handler stays the only writer of an error body
    // (CLAUDE.md §4). The key and the address are never logged.
    handler: (req, _res, next) => {
      log.warn({ tier, userId: req.user?.id }, 'Rate limit reached');
      next(new AppError(rule.message, 429));
    },
  });

  return (req, res, next) => {
    if (!enabled) {
      next();
      return;
    }
    void limiter(req, res, next);
  };
}

export const conversionLimit = buildLimiter('conversion');
export const signInLimit = buildLimiter('signIn');
export const outreachLimit = buildLimiter('outreach');
export const globalLimit = buildLimiter('global');

/**
 * Test-only controls. The test setup switches the limits off for every suite,
 * as E2E does; the rate-limit suites switch them back on and start each test
 * from empty counters.
 */
export function setRateLimitsEnabled(value: boolean): void {
  if (!isTest) {
    throw new Error('setRateLimitsEnabled is only available under NODE_ENV=test');
  }
  enabled = value;
}

export function resetRateLimits(): void {
  if (!isTest) {
    throw new Error('resetRateLimits is only available under NODE_ENV=test');
  }
  for (const store of Object.values(stores)) {
    store.resetAll();
  }
}
