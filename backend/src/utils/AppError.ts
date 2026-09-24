/**
 * The only error type a service is allowed to throw on purpose.
 *
 * Anything else reaching the error handler is a bug, and is reported to the
 * client as a generic 500 with its details kept in the logs (CLAUDE.md §4).
 */
export class AppError extends Error {
  readonly statusCode: number;

  /** True for errors we raised deliberately; false for anything unexpected. */
  readonly isOperational = true;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    Error.captureStackTrace(this, AppError);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
