import { describe, expect, it } from 'vitest';

import { parseEnv } from './env.js';

const validEnv = {
  NODE_ENV: 'development',
  PORT: '4000',
  DATABASE_URL: 'postgresql://bookrough:bookrough@localhost:5432/music_app_dev',
  JWT_SECRET: 'a'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  CORS_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'info',
} satisfies NodeJS.ProcessEnv;

describe('parseEnv', () => {
  it('accepts a complete environment and coerces PORT to a number', () => {
    // Act
    const parsed = parseEnv(validEnv);

    // Assert
    expect(parsed.PORT).toBe(4000);
    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.DATABASE_URL).toBe(validEnv.DATABASE_URL);
  });

  it('applies defaults for the optional variables', () => {
    // Arrange — only the three genuinely required keys
    const minimal = {
      DATABASE_URL: validEnv.DATABASE_URL,
      JWT_SECRET: validEnv.JWT_SECRET,
      GOOGLE_CLIENT_ID: validEnv.GOOGLE_CLIENT_ID,
    };

    // Act
    const parsed = parseEnv(minimal);

    // Assert
    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.PORT).toBe(4000);
    expect(parsed.CORS_ORIGIN).toBe('http://localhost:5173');
    expect(parsed.LOG_LEVEL).toBe('info');
  });

  it('throws and names the variable when DATABASE_URL is missing', () => {
    // Arrange
    const { DATABASE_URL: _omitted, ...withoutDatabaseUrl } = validEnv;

    // Act & Assert
    expect(() => parseEnv(withoutDatabaseUrl)).toThrowError(/DATABASE_URL/);
  });

  it('throws when JWT_SECRET is too short to be worth anything', () => {
    // Arrange
    const weak = { ...validEnv, JWT_SECRET: 'short' };

    // Act & Assert
    expect(() => parseEnv(weak)).toThrowError(/JWT_SECRET/);
  });

  it('names every offending variable at once, not just the first', () => {
    // Arrange
    const { DATABASE_URL: _url, GOOGLE_CLIENT_ID: _clientId, ...missingTwo } = validEnv;

    // Act
    let message = '';
    try {
      parseEnv(missingTwo);
    } catch (error) {
      message = (error as Error).message;
    }

    // Assert
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('GOOGLE_CLIENT_ID');
    expect(message).toContain('.env.example');
  });

  it('rejects a CORS_ORIGIN that is not a URL, which would silently break the cookie', () => {
    expect(() => parseEnv({ ...validEnv, CORS_ORIGIN: 'localhost:5173' })).toThrowError(
      /CORS_ORIGIN/,
    );
  });

  it.each(['production', 'development'])(
    'refuses the E2E Google stand-in under NODE_ENV=%s',
    (nodeEnv) => {
      // Arrange
      const unsafe = {
        ...validEnv,
        NODE_ENV: nodeEnv,
        E2E_GOOGLE_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
      };

      // Act & Assert
      expect(() => parseEnv(unsafe)).toThrowError(
        /E2E_GOOGLE_PUBLIC_KEY: is only allowed with NODE_ENV=test/,
      );
    },
  );

  it('refuses the stand-in when NODE_ENV is unset (it defaults to development)', () => {
    // Arrange
    const { NODE_ENV: _unset, ...withoutNodeEnv } = validEnv;

    // Act & Assert
    expect(() => parseEnv({ ...withoutNodeEnv, E2E_GOOGLE_PUBLIC_KEY: 'key' })).toThrowError(
      /E2E_GOOGLE_PUBLIC_KEY/,
    );
  });

  it('accepts the stand-in under NODE_ENV=test and restores escaped newlines', () => {
    // Act
    const parsed = parseEnv({
      ...validEnv,
      NODE_ENV: 'test',
      // As a one-line env value: literal backslash-n sequences.
      E2E_GOOGLE_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----',
    });

    // Assert
    expect(parsed.E2E_GOOGLE_PUBLIC_KEY).toBe(
      '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
    );
  });

  it('treats an empty stand-in key as not set, even outside test', () => {
    // Act
    const parsed = parseEnv({ ...validEnv, NODE_ENV: 'production', E2E_GOOGLE_PUBLIC_KEY: '' });

    // Assert
    expect(parsed.E2E_GOOGLE_PUBLIC_KEY).toBeUndefined();
  });

  it.each(['production', 'development'])(
    'refuses the E2E scraper stand-in under NODE_ENV=%s',
    (nodeEnv) => {
      // Arrange
      const unsafe = { ...validEnv, NODE_ENV: nodeEnv, E2E_SCRAPER_FIXTURES: 'fixtures.json' };

      // Act & Assert
      expect(() => parseEnv(unsafe)).toThrowError(
        /E2E_SCRAPER_FIXTURES: is only allowed with NODE_ENV=test/,
      );
    },
  );

  it('accepts the scraper stand-in under NODE_ENV=test, and treats empty as not set', () => {
    // Act
    const set = parseEnv({ ...validEnv, NODE_ENV: 'test', E2E_SCRAPER_FIXTURES: 'f.json' });
    const empty = parseEnv({ ...validEnv, NODE_ENV: 'production', E2E_SCRAPER_FIXTURES: '' });

    // Assert
    expect(set.E2E_SCRAPER_FIXTURES).toBe('f.json');
    expect(empty.E2E_SCRAPER_FIXTURES).toBeUndefined();
  });
});
