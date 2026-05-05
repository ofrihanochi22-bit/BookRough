/**
 * Health-check route — GET /api/health
 *
 * Returns basic server stats. Used by:
 *   - Docker/k8s health probes
 *   - Playwright E2E webServer startup check
 *   - Smoke tests in the integration suite
 *
 * No auth required — this endpoint is intentionally public.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../utils/response.js";

export const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  ok(res, {
    status: "ok",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
