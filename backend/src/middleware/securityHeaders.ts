import type { RequestHandler } from 'express';

/**
 * The baseline headers of docs/features/production-hardening.md §3.3, on every
 * API response. The pages get the same set from vercel.json, because the host
 * serves them, not Express. No Content-Security-Policy, by decision (§9).
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
} as const;

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set(SECURITY_HEADERS);
  next();
};
