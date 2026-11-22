import express from 'express';

import { SQUARE_IMAGE_LIMITS } from '../services/squareImage.js';

/** The three formats an uploaded photo may arrive as (avatar-upload.md §4, community-photo.md §4). */
const IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png'];

/**
 * The raw image body, mounted only on the two photo upload routes. Its cap is
 * a little above the real 2 MB limit, so the service — not the parser — says
 * "too large" in our words. Anything that isn't one of the three types is left
 * unparsed, which the controller answers with 415.
 */
export const imageBody = express.raw({
  type: IMAGE_TYPES,
  limit: SQUARE_IMAGE_LIMITS.maxUploadBytes + 64 * 1024,
});
