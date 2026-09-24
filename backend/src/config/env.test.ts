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
});
