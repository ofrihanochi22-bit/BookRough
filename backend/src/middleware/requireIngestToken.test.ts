import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { INVALID_INGEST_TOKEN, requireIngestToken } from './requireIngestToken.js';

/* docs/features/admin-overview.md §8 — unit, the ingest token guard */

const TOKEN = 'a'.repeat(40);

/** `configured: null` stands for an unset OPS_INGEST_TOKEN. */
function run(header: string | undefined, configured: string | null = TOKEN) {
  const next = vi.fn();
  const req = { get: (name: string) => (name === 'authorization' ? header : undefined) } as Request;
  requireIngestToken(() => configured ?? undefined)(req, {} as never, next);
  return next.mock.calls[0]?.[0] as { statusCode?: number; message?: string } | undefined;
}

describe('requireIngestToken', () => {
  it('passes the configured bearer token', () => {
    // Act + Assert
    expect(run(`Bearer ${TOKEN}`)).toBeUndefined();
  });

  it.each([
    ['no header', undefined],
    ['another scheme', `Basic ${TOKEN}`],
    ['the wrong token', `Bearer ${'b'.repeat(40)}`],
    ['a token of another length', 'Bearer short'],
    ['a lowercase scheme', `bearer ${TOKEN}`],
    ['trailing text', `Bearer ${TOKEN} extra`],
  ])('refuses %s with the same 401', (_label, header) => {
    // Act
    const error = run(header);

    // Assert
    expect(error).toMatchObject({ statusCode: 401, message: INVALID_INGEST_TOKEN });
  });

  it('answers 404 when no token is configured, whatever is sent', () => {
    // Act
    const error = run(`Bearer ${TOKEN}`, null);

    // Assert
    expect(error).toMatchObject({ statusCode: 404 });
  });
});
