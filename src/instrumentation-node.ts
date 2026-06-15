/**
 * Node.js-only Instrumentation Setup
 *
 * Imported exclusively from `instrumentation.ts` under the
 * `NEXT_RUNTIME === "nodejs"` guard. Isolating the node-only side effects in
 * their own module keeps the heavy server graph (observability -> Prisma MariaDB
 * adapter + email/googleapis, which all depend on Node built-ins) out of the
 * edge compilation of the instrumentation entry.
 *
 * Installs process-level safety nets so otherwise-silent fatal errors are
 * persisted to SystemLog and surfaced to the owner via a rate-limited alert.
 */

import { logCritical } from "@/lib/observability";

process.on("unhandledRejection", (reason) => {
  logCritical("process.unhandledRejection", reason);
});

process.on("uncaughtException", (error) => {
  logCritical("process.uncaughtException", error);
});
