import { NextResponse } from "next/server";
import { AppError, ValidationError } from "./errors";
import { logError } from "./observability";

/**
 * Normalizes unexpected API exceptions into a JSON response that clients can parse.
 * If the error is an instance of AppError, it uses its status and code.
 */
export function jsonUnexpectedError(error: unknown, fallback: string) {
  let message = fallback;
  let status = 500;
  let code = "INTERNAL_ERROR";
  let details: unknown = undefined;

  if (error instanceof AppError) {
    message = error.message;
    status = error.status;
    code = error.code;
    
    if (error instanceof ValidationError) {
      details = error.details;
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  // Ensure we log the actual error for observability
  logError("api_error", error, { code, status });

  return NextResponse.json(
    {
      error: message,
      code,
      details
    },
    { status }
  );
}
