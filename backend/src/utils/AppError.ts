/**
 * AppError — the only error type that should leave a service layer.
 *
 * Throw this (or a subclass) from services and controllers to signal a
 * predictable, user-facing error. The central error middleware in
 * `middleware/errorHandler.ts` catches it, reads `statusCode`, and
 * sends the canonical `{ status: "error", code, message }` envelope.
 *
 * Never throw plain `Error` objects from business logic — the middleware
 * will treat those as unexpected 500s.
 *
 * Example:
 *   throw new AppError("Email already exists", 400, "DUPLICATE_EMAIL");
 */
export class AppError extends Error {
  /** HTTP status code sent to the client (e.g. 400, 401, 404, 500). */
  public readonly statusCode: number;

  /**
   * Optional machine-readable code for the frontend to branch on
   * (e.g. "DUPLICATE_EMAIL", "INVALID_TOKEN").
   */
  public readonly code: string | undefined;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;

    // Maintains correct prototype chain when extending built-in Error in ES5 targets
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
