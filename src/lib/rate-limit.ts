import { NextRequest } from "next/server";

type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const globalStore = globalThis as unknown as {
  __rateLimitStore?: Map<string, RateLimitState>;
};

const store = globalStore.__rateLimitStore ?? new Map<string, RateLimitState>();
if (!globalStore.__rateLimitStore) {
  globalStore.__rateLimitStore = store;
}

/**
 * Extracts a stable client IP value from forwarded headers.
 */
export function getRequestIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Sliding-window style in-memory rate limiter for sensitive API endpoints.
 */
export function consumeRateLimit(input: RateLimitInput): RateLimitResult {
  if (process.env.NODE_ENV === "test") {
    return {
      allowed: true,
      remaining: input.limit,
      retryAfterSeconds: 0
    };
  }

  const now = Date.now();
  const existing = store.get(input.key);

  if (!existing || existing.resetAt <= now) {
    store.set(input.key, {
      count: 1,
      resetAt: now + input.windowMs
    });
    return {
      allowed: true,
      remaining: Math.max(input.limit - 1, 0),
      retryAfterSeconds: 0
    };
  }

  if (existing.count >= input.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1)
    };
  }

  existing.count += 1;
  store.set(input.key, existing);

  return {
    allowed: true,
    remaining: Math.max(input.limit - existing.count, 0),
    retryAfterSeconds: 0
  };
}
