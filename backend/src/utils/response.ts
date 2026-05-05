/**
 * Response envelope helpers — every API response goes through one of these.
 *
 * Enforces the standard shapes from the architecture conventions:
 *
 *   Success:  { "status": "success", "data": { ... } }
 *   Error:    { "status": "error",   "code": 404, "message": "..." }
 *
 * Controllers call `ok(res, { user })` instead of `res.json(...)` directly
 * so the shape can never diverge from the contract.
 */

import type { Response } from "express";

/** Send a successful response. Defaults to HTTP 200. */
export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ status: "success", data });
}

/** Send an error response. Mirrors the backend AppError shape. */
export function fail(
  res: Response,
  code: number,
  message: string,
  errorCode?: string
): void {
  res.status(code).json({ status: "error", code, message, errorCode });
}
