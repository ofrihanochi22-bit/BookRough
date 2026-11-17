import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sessionUser } from '../middleware/requireAuth.js';
import { recordAppOpen } from '../services/appOpens.js';
import { getAdminSettings, getPublicSettings, updateSettings } from '../services/appSettings.js';
import { createLogger } from '../utils/logger.js';
import { success } from '../utils/response.js';
import { parseBody } from '../utils/validate.js';

/**
 * Shapes and generous raw lengths only; the real rules (cleaning, limits,
 * palette) are the service's, so every message comes from one place.
 */
const settingsUpdateSchema = z
  .object({
    announcement: z
      .object({ enabled: z.boolean(), text: z.string().max(2000) })
      .strict()
      .optional(),
    accentColor: z.string().max(50).optional(),
    welcomeTagline: z.string().max(2000).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0);

const log = createLogger('settings');

/** GET /api/settings — public, behind optionalAuth. */
export const publicSettings: RequestHandler = async (req, res, next) => {
  try {
    // The app's start-up fetch adds open=1: one anonymous app open
    // (docs/features/admin-overview.md §4.5). Not awaited, and a failure
    // never touches the settings answer.
    if (req.query.open === '1') {
      recordAppOpen(req.user !== undefined).catch((error: unknown) => {
        log.warn({ err: error }, 'Could not count an app open');
      });
    }
    res.status(200).json(success(await getPublicSettings(req.user !== undefined)));
  } catch (error) {
    next(error);
  }
};

/** GET /api/admin/settings — behind requireAuth + requireAppAdmin. */
export const adminSettings: RequestHandler = async (_req, res, next) => {
  try {
    res.status(200).json(success(await getAdminSettings()));
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/admin/settings — behind requireAuth + requireAppAdmin. */
export const changeSettings: RequestHandler = async (req, res, next) => {
  try {
    const update = parseBody(settingsUpdateSchema, req.body);
    res.status(200).json(success(await updateSettings(sessionUser(req).id, update)));
  } catch (error) {
    next(error);
  }
};
