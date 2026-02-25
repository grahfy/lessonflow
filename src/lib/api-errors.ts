import { NextResponse } from "next/server";

/**
 * Normalizes unexpected API exceptions into a JSON 500 response that clients can parse.
 */
export function jsonUnexpectedError(error: unknown, fallback: string) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : fallback
    },
    { status: 500 }
  );
}
