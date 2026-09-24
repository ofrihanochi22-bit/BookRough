import { describe, expect, it } from 'vitest';

import { AppError, isAppError } from './AppError.js';

describe('AppError', () => {
  it('carries the message, the status code, and the operational flag', () => {
    // Arrange & Act
    const error = new AppError('Community not found.', 404);

    // Assert
    expect(error.message).toBe('Community not found.');
    expect(error.statusCode).toBe(404);
    expect(error.isOperational).toBe(true);
    expect(error.name).toBe('AppError');
    expect(error.stack).toBeDefined();
  });

  it('is an instance of Error, so existing error handling still applies', () => {
    // Arrange & Act
    const error = new AppError('Nope.', 400);

    // Assert
    expect(error).toBeInstanceOf(Error);
  });
});

describe('isAppError', () => {
  it('recognises an AppError', () => {
    expect(isAppError(new AppError('Nope.', 400))).toBe(true);
  });

  it('rejects a plain Error, which must become a generic 500', () => {
    expect(isAppError(new Error('Database exploded'))).toBe(false);
  });

  it('rejects a non-error value', () => {
    expect(isAppError('not an error')).toBe(false);
  });
});
