/**
 * Rate Limiting Module
 * 
 * Provides in-memory sliding window rate limiting for API endpoints to prevent
 * abuse and brute-force attacks.
 * 
 * SECURITY:
 * - Protects against brute-force login attempts
 * - Prevents API endpoint abuse
 * - Uses client IP as the rate limit key
 * 
 * UI/USAGE:
 * - Used by login endpoints to limit failed attempts
 * - Used by booking API to prevent spam submissions
 * - Returns headers: X-RateLimit-Remaining, Retry-After
 */

import { NextRequest } from "next/server";

/**
 * Input parameters for rate limit consumption.
 */
type RateLimitInput = {
  key: string;        // Unique identifier for rate limiting scope
  limit: number;      // Maximum requests allowed in the time window
  windowMs: number;   // Time window in milliseconds
};

/**
 * Internal state tracking for rate limit counters.
 */
type RateLimitState = {
  count: number;      // Current request count in window
  resetAt: number;    // Unix timestamp when window resets
};

/**
 * Result object returned after checking rate limit.
 */
export type RateLimitResult = {
  allowed: boolean;           // Whether request is permitted
  remaining: number;           // Remaining requests in window
  retryAfterSeconds: number;  // Seconds to wait if rate limited
};

/**
 * Global in-memory store for rate limiting state.
 * Uses globalThis to persist across hot reloads in development.
 * 
 * STRUCTURE: Map<key, {count, resetAt}>
 * SECURITY: In production with multiple instances, this should use
 *           Redis or similar distributed store
 */
const globalStore = globalThis as unknown as {
  __rateLimitStore?: Map<string, RateLimitState>;
};

/**
 * Initialize or retrieve the global rate limit store.
 */
const store = globalStore.__rateLimitStore ?? new Map<string, RateLimitState>();
if (!globalStore.__rateLimitStore) {
  globalStore.__rateLimitStore = store;
}

/**
 * Extracts client IP address from request headers.
 * 
 * Handles common proxy/load balancer header formats.
 *
 * DigitalOcean Droplet recommendation (Nginx/Caddy reverse proxy):
 * - Set `X-Real-IP` from the proxy's remote address and prefer it here.
 * - If only `X-Forwarded-For` is available and the proxy appends values,
 *   the last entry is the most trustworthy hop added by the reverse proxy.
 * 
 * @param request - Next.js request object
 * @returns Client IP string or "unknown" as fallback
 */
export function getRequestIpFromHeaders(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const last = parts.at(-1);
    if (last) {
      return last;
    }
  }

  return "unknown";
}

/**
 * Backward-compatible wrapper for existing callers that pass NextRequest.
 */
export function getRequestIp(request: NextRequest): string {
  return getRequestIpFromHeaders(request.headers);
}

/**
 * Consumes a rate limit slot for the given key.
 * 
 * Implements sliding window style limiting:
 * - If no existing state or window expired: create new counter at 1
 * - If under limit: increment counter
 * - If at/over limit: reject with retry time
 * 
 * SECURITY:
 * - Disabled in test environment to allow unlimited testing
 * - Returns consistent response format for client handling
 * 
 * @param input - Rate limit parameters
 * @returns RateLimitResult indicating allowed/remaining/retry time
 */
export function consumeRateLimit(input: RateLimitInput): RateLimitResult {
  // Disable rate limiting in test environment
  if (process.env.NODE_ENV === "test") {
    return {
      allowed: true,
      remaining: input.limit,
      retryAfterSeconds: 0
    };
  }

  const now = Date.now();
  const existing = store.get(input.key);

  // New window or expired window - start fresh
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

  // Window active but at limit - reject request
  if (existing.count >= input.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1)
    };
  }

  // Window active and under limit - increment
  existing.count += 1;
  store.set(input.key, existing);

  return {
    allowed: true,
    remaining: Math.max(input.limit - existing.count, 0),
    retryAfterSeconds: 0
  };
}
