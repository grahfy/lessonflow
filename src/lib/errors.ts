/**
 * Base class for application-specific errors that include a machine-readable code.
 * Used to distinguish between expected domain errors and unexpected system failures.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(message: string, code: string = "INTERNAL_ERROR", status: number = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    
    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

/**
 * Specifically for validation errors (e.g., Zod failures).
 */
export class ValidationError extends AppError {
  constructor(message: string, public readonly details?: unknown) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

/**
 * Specifically for authentication/authorization failures.
 */
export class AuthError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "AuthError";
  }
}

/**
 * Specifically for resource not found errors.
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    super(
      `${resource}${identifier ? ` '${identifier}'` : ""} not found`, 
      "NOT_FOUND", 
      404
    );
    this.name = "NotFoundError";
  }
}
