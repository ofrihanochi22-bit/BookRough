import type { ZodType } from 'zod';

import { AppError } from './AppError.js';

/**
 * Parses a request body against a Zod schema. A body that is valid JSON but the
 * wrong shape is a 422; unparseable JSON never gets this far — the error
 * handler turns it into a 400.
 */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new AppError('The request body is invalid.', 422);
  }

  return result.data;
}
