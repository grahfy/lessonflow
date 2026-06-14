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
 *    from headers (`X-Real-IP` or `X-Forwarded-For`). These headers are
 *    client-spoofable, so trust is gated on `TRUST_PROXY` /
 *    `TRUSTED_PROXY_HOPS` to reflect the single-droplet Nginx topology.
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
  __rateLimitSweepRegistered?: boolean;
};

const store = globalStore.__rateLimitStore ?? new Map<string, RateLimitState>();
if (!globalStore.__rateLimitStore) {
  globalStore.__rateLimitStore = store;
}

/** Interval between background prunes of expired rate-limit entries. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Registers a periodic background sweep that prunes expired entries even when no
 * traffic is hitting `consumeRateLimit` (which only prunes lazily on call).
 *
 * RATIONALE: Under the single-process / 1G memory deployment a quiet period
 * after a traffic spike would otherwise leave stale buckets resident until the
 * next request. The interval is `.unref()`-ed so it never keeps the Node process
 * alive, and a `globalThis` guard ensures only one timer survives HMR.
 */
function registerExpiredEntrySweep(): void {
  if (globalStore.__rateLimitSweepRegistered) return;
  globalStore.__rateLimitSweepRegistered = true;

  const timer = setInterval(() => {
    evictExpiredEntries(Date.now());
  }, SWEEP_INTERVAL_MS);
  // Do not let the sweep timer hold the event loop open.
  timer.unref?.();
}

/**
 * Extracts the most trustworthy client IP from request headers.
 *
 * TRUST MODEL (single-droplet behind Nginx):
 * Both `X-Real-IP` and `X-Forwarded-For` are client-spoofable unless the
 * front proxy is known to overwrite them. Trust is therefore gated on env:
 *
 * - `TRUST_PROXY` (default "true"): Nginx is the only hop and sets/overwrites
 *   `x-real-ip` with the real peer address, so prefer it. When `x-real-ip`
 *   is absent, fall back to `X-Forwarded-For` parsed from the RIGHT by
 *   `TRUSTED_PROXY_HOPS` (the right-most entries are appended by trusted
 *   proxies; the left-most are attacker-controlled and must NOT be used).
 * - `TRUST_PROXY === "false"`: ignore both headers entirely and return
 *   "unknown". This fails safe by funnelling everyone into a single shared
 *   bucket rather than honoring a spoofable identity.
 *
 * `TRUSTED_PROXY_HOPS` (int, default 1) is the number of trusted proxy hops
 * in front of the app; `parts[parts.length - hops]` is the address handed to
 * the outermost trusted proxy.
 *
 * @param headers - Request headers
 */
export function getRequestIpFromHeaders(headers: Headers): string {
  if (process.env.TRUST_PROXY === "false") {
    // Fail-safe: do not trust any client-supplied forwarding headers.
    return "unknown";
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (parts.length > 0) {
      const parsedHops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "", 10);
      const hops = Number.isFinite(parsedHops) && parsedHops >= 1 ? parsedHops : 1;
      // Parse from the RIGHT: the right-most entries are appended by our own
      // trusted proxies; left-most entries are attacker-controlled.
      const index = Math.max(parts.length - hops, 0);
      const candidate = parts[index];
      if (candidate) return candidate;
    }
  }

  return "unknown";
}

/** Legacy wrapper for NextRequest objects. */
export function getRequestIp(request: NextRequest): string {
  return getRequestIpFromHeaders(request.headers);
}

/** Evicts expired entries from the store to prevent unbounded memory growth. */
function evictExpiredEntries(now: number): void {
  for (const [key, state] of store) {
    if (state.resetAt <= now) {
      store.delete(key);
    }
  }
}

// Register the background sweep once at module init so idle periods still prune
// expired buckets even when no request triggers the lazy eviction path.
registerExpiredEntrySweep();

/**
 * Tickers the rate limiter for a specific key.
 * 
 * @param input - Key and Window constraints
 */
export function consumeRateLimit(input: RateLimitInput): RateLimitResult {
  // SECURITY: Disable rate limiting only under an explicit test signal.
  // Vitest auto-sets `VITEST`, so the suite stays unaffected, but a production
  // process accidentally started with NODE_ENV=test will NOT bypass throttling.
  if (process.env.VITEST != null || process.env.RATE_LIMIT_DISABLED === "1") {
    return {
      allowed: true,
      remaining: input.limit,
      retryAfterSeconds: 0
    };
  }

  const now = Date.now();

  // Lazy eviction: remove expired entries to prevent unbounded memory growth.
  // Runs on every call but is O(n) only on the current store size which stays
  // small for single-instance deployments.
  evictExpiredEntries(now);

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
