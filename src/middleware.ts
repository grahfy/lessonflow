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

/**
 * Never run on `/api/*`.
 *
 * Server Actions are POSTed to page routes, so the `next-action` guard above has
 * nothing to do on API traffic — and running it there silently corrupts uploads.
 * Whenever middleware matches a request, Next.js clones the request body through
 * `getCloneableBody`, which truncates at `experimental.middlewareClientMaxBodySize`
 * (10 MB by default) and hands the truncated copy to the route handler as well.
 * A learning-material upload over 10 MB therefore reached the route as a
 * multipart body with no closing boundary, and `request.formData()` threw
 * "Failed to parse body as FormData" — surfacing as "Invalid upload payload."
 *
 * Raising `middlewareClientMaxBodySize` instead would work, but it makes Next
 * buffer the full body of every request in memory; this app's prod unit runs
 * under `MemoryMax=1G`. Not matching is free.
 */
export const config = {
  matcher: ["/((?!api/).*)"]
};
