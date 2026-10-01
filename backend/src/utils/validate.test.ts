import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from './AppError.js';
import { parseBody } from './validate.js';

const schema = z.object({ name: z.string().min(1) }).strict();

describe('parseBody', () => {
  it('returns the parsed body when it matches', () => {
    // Act & Assert
    expect(parseBody(schema, { name: 'x' })).toEqual({ name: 'x' });
  });

  it('throws a 422 AppError when it does not', () => {
    // Act
    const attempt = () => parseBody(schema, { name: '' });

    // Assert
    expect(attempt).toThrow(AppError);
    expect(attempt).toThrow(expect.objectContaining({ statusCode: 422 }));
  });

  it('throws a 422 for a missing body', () => {
    // Act & Assert
    expect(() => parseBody(schema, undefined)).toThrow(
      expect.objectContaining({ statusCode: 422 }),
    );
  });
});
