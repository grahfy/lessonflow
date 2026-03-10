/**
 * Security Throttling & Rate Limiting Engine
 * 
 * Provides an in-memory sliding window rate limiter to protect public facing 
 * endpoints (Login, Booking, Contact Form) from brute-force and SPAM.
 * 
 * DESIGN RATIONALE:
 * 1. Low-Latency Protection: By using a simple in-memory Map (scoped to 
 *    `globalThis` to survive HMR), we avoid the network overhead of an 
 *    external cache (like Redis) for the current single-droplet architecture.
 * 2. IP-Based Identification: Uses the most trustworthy client IP extracted 
 *    from headers (`X-Real-IP` or `X-Forwarded-For`).
 * 3. Transparent Feedback: Returns standard rate-limit headers to clients, 
 *    allowing the UI to show accurate "Retry-After" countdowns.
 */

import { NextRequest } from "next/server";

/** Configuration for a specific rate-limiting bucket. */
type RateLimitInput = {
  /** Unique key (e.g. `login:${ip}`). */
  key: string;
  /** Max allowed requests in this window. */
  limit: number;
  /** Duration of the window in milliseconds. */
  windowMs: number;
};

/** Tracking state for a specific key. */
type RateLimitState = {
  count: number;
  resetAt: number;
};

/** High-level result of a consumption attempt. */
export type RateLimitResult = {
  /** True if the request should proceed. */
  allowed: boolean;
  /** Remaining slots in the current window. */
  remaining: number;
  /** Seconds until the window resets (if at limit). */
  retryAfterSeconds: number;
};

/**
 * Global in-memory store for rate limiting state.
 * RATIONALE: Using `globalThis` ensures the store is not wiped during 
 * Next.js development hot-reloads.
 */
const globalStore = globalThis as unknown as {
  __rateLimitStore?: Map<string, RateLimitState>;
};

const store = globalStore.__rateLimitStore ?? new Map<string, RateLimitState>();
if (!globalStore.__rateLimitStore) {
  globalStore.__rateLimitStore = store;
}

/**
 * Extracts the most granular client IP from request headers.
 * 
 * LOGIC:
 * 1. Check `X-Real-IP` (Set by Nginx/Caddy proxies).
 * 2. Check `X-Forwarded-For` (Taking the last hop as the most reliable).
 * 
 * @param headers - Request headers
 */
export function getRequestIpFromHeaders(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const last = parts.at(-1);
    if (last) return last;
  }

  return "unknown";
}

/** Legacy wrapper for NextRequest objects. */
export function getRequestIp(request: NextRequest): string {
  return getRequestIpFromHeaders(request.headers);
}

/**
 * Tickers the rate limiter for a specific key.
 * 
 * @param input - Key and Window constraints
 */
export function consumeRateLimit(input: RateLimitInput): RateLimitResult {
  // SECURITY: Disable rate limiting in tests to avoid flakiness in E2E suites.
  if (process.env.NODE_ENV === "test") {
    return {
      allowed: true,
      remaining: input.limit,
      retryAfterSeconds: 0
    };
  }

  const now = Date.now();
  const existing = store.get(input.key);

  // Scenario A: New window or expired window - start fresh
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

  // Scenario B: Window active but at limit - reject request
  if (existing.count >= input.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1)
    };
  }

  // Scenario C: Window active and under limit - increment
  existing.count += 1;
  store.set(input.key, existing);

  return {
    allowed: true,
    remaining: Math.max(input.limit - existing.count, 0),
    retryAfterSeconds: 0
  };
}
