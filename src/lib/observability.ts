type LogLevel = "info" | "warn" | "error";

function stringifyMeta(meta?: Record<string, unknown>) {
  if (!meta) {
    return "";
  }
  try {
    return JSON.stringify(meta);
  } catch {
    return "[unserializable-meta]";
  }
}

export function logEvent(event: string, meta?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] [info] ${event} ${stringifyMeta(meta)}`;
  console.info(line);
}

export function logError(event: string, error: unknown, meta?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] [error] ${event} ${stringifyMeta(meta)}`;
  console.error(line);
  if (error instanceof Error) {
    console.error(error.stack || error.message);
  } else {
    console.error(error);
  }
}

export function log(level: LogLevel, event: string, meta?: Record<string, unknown>) {
  if (level === "error") {
    logError(event, null, meta);
    return;
  }
  const line = `[${new Date().toISOString()}] [${level}] ${event} ${stringifyMeta(meta)}`;
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}
