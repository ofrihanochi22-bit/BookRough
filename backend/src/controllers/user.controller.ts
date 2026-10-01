import { StreamingService } from '@prisma/client';
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { checkAvailability, updateProfile } from '../services/user.service.js';
import { sessionUser } from '../middleware/requireAuth.js';
import { sessionPayload } from '../utils/publicUser.js';
import { success } from '../utils/response.js';
import { parseBody, parseQuery } from '../utils/validate.js';

const profileUpdateSchema = z
  .object({
    displayName: z.string().max(200).optional(),
    preferredService: z.nativeEnum(StreamingService).optional(),
    useGooglePicture: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0);

const availabilityQuerySchema = z.object({ name: z.string().min(1).max(200) });

/** PATCH /api/users/me — mounted behind requireAuth. */
export const updateMe: RequestHandler = async (req, res, next) => {
  try {
    const update = parseBody(profileUpdateSchema, req.body);
    const user = await updateProfile(sessionUser(req), update);
    res.status(200).json(success(sessionPayload(user)));
  } catch (error) {
    next(error);
  }
};

/** GET /api/users/display-name-availability?name= — mounted behind requireAuth. */
export const displayNameAvailability: RequestHandler = async (req, res, next) => {
  try {
    const { name } = parseQuery(availabilityQuerySchema, req.query);
    res.status(200).json(success(await checkAvailability(sessionUser(req), name)));
  } catch (error) {
    next(error);
  }
};
