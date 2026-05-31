import { NextRequest, NextResponse } from "next/server";

/**
 * Reject stale or malformed Next Server Action requests before Next.js resolves them.
 *
 * RATIONALE: This application uses explicit API routes for mutations rather than
 * Next Server Actions. Browsers or extensions can occasionally replay stale
 * `Next-Action` headers against page routes during local development, which
 * causes noisy "Failed to find Server Action" errors in the dev server logs.
 *
 * SECURITY (H1, defense-in-depth — trust boundary):
 * The spoofable inbound headers `x-vercel-ip-country`, `cf-ipcountry`,
 * `x-real-ip`, and `x-forwarded-for` MUST be stripped/normalized at the Nginx
 * layer before they reach the app:
 *   - Nginx should OVERWRITE `X-Forwarded-For`/`X-Real-IP` with `$remote_addr`
 *     (the real peer) and DROP inbound `X-Vercel-*` / `CF-*` headers.
 * They are intentionally NOT stripped here: Next.js middleware cannot reliably
 * remove request headers before its own route matcher / internals observe them,
 * and doing so risks breaking matcher behavior. The app-layer code that
 * consumes these headers (`src/lib/rate-limit.ts`, `src/lib/geo-country.ts`)
 * therefore gates trust on `TRUST_PROXY` / `TRUST_EDGE_GEO` as the in-process
 * safeguard. Edge stripping at Nginx remains the primary control.
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
