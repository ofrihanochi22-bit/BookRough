import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { REDACTED_LOG_PATHS } from './logger.js';
import { redactPath, serializeRequest } from './redactPath.js';

/*
 * What the request log may carry — docs/features/find-people.md §4. A searched
 * name is PII (CLAUDE.md §4); the invite-token half is in inviteToken.test.ts.
 */
describe('redactPath and query strings', () => {
  it('replaces a query string and keeps the path', () => {
    // Act & Assert
    expect(redactPath('/api/users/search?q=Dana%20Levi')).toBe('/api/users/search?…');
    expect(redactPath('/api/users/display-name-availability?name=Ofri')).toBe(
      '/api/users/display-name-availability?…',
    );
    expect(redactPath('/api/users/me/bookmarks')).toBe('/api/users/me/bookmarks');
  });
});

describe('serializeRequest', () => {
  it('drops the parsed query and params and redacts the URL, keeping the rest', () => {
    // Arrange: the shape pino-http hands its serializer.
    const req = {
      id: 7,
      method: 'GET',
      url: '/api/users/search?q=Dana',
      query: { q: 'Dana' },
      params: { token: 'qEP_iUKg0kWils3eSHVHZQ' },
      headers: { host: 'localhost' },
    };

    // Act
    const logged = serializeRequest(req);

    // Assert
    expect(logged).toEqual({
      id: 7,
      method: 'GET',
      url: '/api/users/search?…',
      headers: { host: 'localhost' },
    });
    expect(JSON.stringify(logged)).not.toContain('Dana');
  });
});

describe('REDACTED_LOG_PATHS', () => {
  it('removes the referer, cookie and authorization headers from a log line', () => {
    // Arrange: a logger configured exactly like the app's, writing to memory.
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const log = pino({ redact: { paths: [...REDACTED_LOG_PATHS], remove: true } }, sink);

    // Act
    log.info({
      req: {
        url: '/api/users/search?…',
        headers: {
          host: 'localhost',
          referer: 'https://bookrough.example/search?q=Dana',
          cookie: 'token=secret',
          authorization: 'Bearer secret',
        },
      },
    });

    // Assert
    const line = JSON.parse(lines[0]!) as { req: { headers: Record<string, string> } };
    expect(line.req.headers).toEqual({ host: 'localhost' });
  });
});
