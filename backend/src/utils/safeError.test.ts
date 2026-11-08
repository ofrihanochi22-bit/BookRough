import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { serializeError } from './safeError.js';

/*
 * docs/features/production-hardening.md §3.5: a Prisma request error renders
 * its query and arguments, so a value a user typed must never reach the log
 * through it — directly or as another error's cause.
 */
const SECRET_VALUE = 'Dana Levi — a comment nobody else should read';

function knownRequestError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `Invalid \`prisma.post.create()\` invocation:\n  data: { comment: "${SECRET_VALUE}" }`,
    {
      code: 'P2002',
      clientVersion: '6.1.0',
      meta: { modelName: 'Post', target: ['author_id', 'url'], cause: SECRET_VALUE },
    },
  );
}

describe('serializeError', () => {
  it('withholds a known request error message, keeping class, code, names and frames', () => {
    // Act
    const logged = serializeError(knownRequestError()) as Record<string, unknown>;

    // Assert
    expect(JSON.stringify(logged)).not.toContain(SECRET_VALUE);
    expect(logged).toMatchObject({
      type: 'PrismaClientKnownRequestError',
      message: 'Prisma error message withheld from the log',
      code: 'P2002',
      meta: { modelName: 'Post', target: ['author_id', 'url'] },
    });
    expect(String(logged.stack)).toMatch(/^\s+at /);
  });

  it('withholds a validation error, which prints its arguments', () => {
    // Arrange
    const error = new Prisma.PrismaClientValidationError(
      `Argument displayName: "${SECRET_VALUE}"`,
      {
        clientVersion: '6.1.0',
      },
    );

    // Act
    const logged = serializeError(error);

    // Assert
    expect(JSON.stringify(logged)).not.toContain(SECRET_VALUE);
  });

  it('drops a meta that carries only prose, and a target that is not names', () => {
    // Arrange
    const error = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2025',
      clientVersion: '6.1.0',
      meta: { cause: SECRET_VALUE, target: [{ value: SECRET_VALUE }] },
    });

    // Act
    const logged = serializeError(error) as Record<string, unknown>;

    // Assert
    expect(logged.meta).toBeUndefined();
    expect(JSON.stringify(logged)).not.toContain(SECRET_VALUE);
  });

  it('keeps a string target', () => {
    // Arrange
    const error = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2002',
      clientVersion: '6.1.0',
      meta: { target: 'users_display_name_key_key' },
    });

    // Act & Assert
    expect(serializeError(error)).toMatchObject({ meta: { target: 'users_display_name_key_key' } });
  });

  it('withholds a Prisma error wrapped as a cause, keeping the wrapper message', () => {
    // Arrange
    const wrapper = new Error('Could not save the post', { cause: knownRequestError() });

    // Act
    const logged = serializeError(wrapper) as Record<string, unknown>;

    // Assert
    expect(JSON.stringify(logged)).not.toContain(SECRET_VALUE);
    expect(logged.message).toBe('Could not save the post');
    expect(logged.cause).toMatchObject({ type: 'PrismaClientKnownRequestError', code: 'P2002' });
  });

  it('keeps the message of a connection error, which carries no user data', () => {
    // Arrange
    const error = new Prisma.PrismaClientInitializationError(
      "Can't reach database server at `db.example:5432`",
      '6.1.0',
    );

    // Act & Assert
    expect(serializeError(error)).toMatchObject({
      message: "Can't reach database server at `db.example:5432`",
    });
  });

  it('logs any other error as pino would, causes included', () => {
    // Arrange
    const error = new TypeError('x is undefined', { cause: new Error('inner') });

    // Act
    const logged = serializeError(error) as Record<string, unknown>;

    // Assert
    expect(logged).toMatchObject({ type: 'TypeError' });
    expect(String(logged.message)).toContain('x is undefined');
  });

  it('passes a non-error through untouched', () => {
    // Act & Assert
    expect(serializeError('plain')).toBe('plain');
  });
});
