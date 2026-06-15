/**
 * Client-side error reporter.
 *
 * Posts a sanitized error report from a React error boundary to the
 * `/api/internal/client-error` endpoint so browser crashes land in SystemLog.
 *
 * DESIGN: Strictly fire-and-forget — any failure (offline, 429, 4xx) is
 * swallowed so the reporter can never itself surface an error inside an error
 * boundary. Fields are length-clamped client-side to match the server schema and
 * avoid sending oversized bodies.
 */

type ClientErrorBoundary = "root" | "admin" | "student";

const MAX_MESSAGE = 1000;
const MAX_STACK = 4000;

export function reportClientError(
  boundary: ClientErrorBoundary,
  error: Error & { digest?: string }
): void {
  try {
    const payload = JSON.stringify({
      boundary,
      message: (error?.message || "Unknown client error").slice(0, MAX_MESSAGE),
      stack: error?.stack ? error.stack.slice(0, MAX_STACK) : undefined,
      digest: error?.digest,
      path: typeof window !== "undefined" ? window.location?.pathname : undefined
    });

    void fetch("/api/internal/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true
    }).catch(() => {
      // Reporting is best-effort; never throw from inside an error boundary.
    });
  } catch {
    // Serialization or fetch setup failed — ignore.
  }
}
