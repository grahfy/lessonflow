/**
 * Next.js Instrumentation Hook
 *
 * Registered once per server process at startup. We use it to install
 * process-level safety nets so that otherwise-silent fatal errors are persisted
 * to the SystemLog table and surfaced to the owner via a rate-limited alert.
 *
 * RATIONALE: Without these handlers an `unhandledRejection` or
 * `uncaughtException` only hits stdout (captured by PM2/systemd) and can crash
 * the process with no durable, admin-visible record. Routing them through
 * `logCritical` gives the single-droplet deployment an in-app error trail.
 */

export async function register() {
  // Guard: process-level handlers only make sense in the Node.js runtime, not
  // the Edge runtime (which lacks Node's `process` event model and our DB).
  //
  // The node-only setup lives in a separate `instrumentation-node` module that
  // is imported ONLY inside this branch. This is the Next.js-documented pattern:
  // it keeps the heavy server graph (observability -> Prisma MariaDB adapter +
  // email/googleapis, all of which require Node built-ins) out of the edge
  // compilation of the instrumentation entry, which otherwise fails the build
  // with "Module not found: Can't resolve 'crypto'/'http2'/...".
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
