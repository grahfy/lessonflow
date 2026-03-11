import { NextRequest, NextResponse } from "next/server";

/**
 * Reject stale or malformed Next Server Action requests before Next.js resolves them.
 *
 * RATIONALE: This application uses explicit API routes for mutations rather than
 * Next Server Actions. Browsers or extensions can occasionally replay stale
 * `Next-Action` headers against page routes during local development, which
 * causes noisy "Failed to find Server Action" errors in the dev server logs.
 */
export function middleware(request: NextRequest): NextResponse {
  if (request.headers.has("next-action")) {
    return new NextResponse("Server actions are not supported by this app.", {
      status: 400,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  }

  return NextResponse.next();
}
