/**
 * Bot Defense & SVG CAPTCHA Engine
 * 
 * Provides a dependency-free, lightweight CAPTCHA system to protect public 
 * forms (Bookings, Contacts) from automated submissions.
 * 
 * DESIGN RATIONALE:
 * 1. SVG-Based Rendering: We generate CAPTCHA images as SVG DataURIs server-side. 
 *    This avoids external image-processing dependencies (like Canvas/Sharp) 
 *    and ensures crisp rendering on all screen densities.
 * 2. Visual Obfuscation: Uses random rotation, skewing, noise curves, 
 *    fractal turbulence (SVG filters), and occlusion bars to thwart OCR 
 *    while remaining readable to humans.
 * 3. Atomic Challenges: Challenges are stored in a short-lived (5m TTL) 
 *    in-memory Map and are consumed immediately upon a single verification 
 *    attempt (fail or pass), preventing replay attacks.
 * 4. UX Optimization: Uses a filtered alphabet (omitting 0/O, 1/I) to 
 *    reduce user frustration from visually ambiguous characters.
 */

import { randomInt, randomUUID } from "node:crypto";
import { consumeRateLimit, getRequestIpFromHeaders, type RateLimitResult } from "@/lib/rate-limit";

/** Internal challenge state. */
type CaptchaRecord = {
  /** The plain-text answer to match against. */
  answer: string;
  /** Unix expiration timestamp. */
  expiresAt: number;
};

/** Public payload returned to the client-side component. */
export type CaptchaChallenge = {
  /** Unique challenge identifier. */
  token: string;
  /** Base64 encoded SVG string. */
  imageDataUrl: string;
  /** Seconds until the token becomes invalid. */
  expiresInSeconds: number;
  /** Localization-ready descriptive prompt. */
  prompt: string;
};

export type CaptchaValidationResult =
  | { ok: true }
  | { ok: false; code: "MISSING" | "NOT_FOUND" | "EXPIRED" | "INVALID"; message: string };

export type CaptchaGuardResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      code: "HONEYPOT_FILLED" | "CAPTCHA_RATE_LIMITED" | "MISSING" | "NOT_FOUND" | "EXPIRED" | "INVALID";
      message: string;
      retryAfterSeconds?: number;
    };

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_LENGTH = 6;
// Filtered alphabet: No O, 0, I, 1
const CAPTCHA_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*+-=?";

/** Interval between background prunes of expired challenges. */
const CAPTCHA_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
/**
 * Hard ceiling on resident challenges. A flood of un-consumed challenges (each
 * lives until its 5m TTL or a single verification) could otherwise grow the
 * Map unbounded between sweeps; once the cap is hit we evict the oldest
 * (insertion-ordered) entries first.
 */
const CAPTCHA_MAX_ENTRIES = 50_000;

/**
 * Global in-memory store for CAPTCHA challenges.
 * RATIONALE: pinned on `globalThis` (mirroring src/lib/rate-limit.ts) so the
 * store survives Next.js HMR in development and is shared across module
 * instances, and so only one background sweep timer is ever registered.
 */
const globalStore = globalThis as unknown as {
  __captchaStore?: Map<string, CaptchaRecord>;
  __captchaSweepRegistered?: boolean;
};

const captchaStore = globalStore.__captchaStore ?? new Map<string, CaptchaRecord>();
if (!globalStore.__captchaStore) {
  globalStore.__captchaStore = captchaStore;
}

/**
 * Normalizes input for comparison.
 */
function normalizeCaptchaAnswer(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Opportunistic cleanup of expired challenges. Runs lazily on every create /
 * verify call; the background sweep below covers idle periods.
 */
function cleanupExpiredChallenges(now = Date.now()): void {
  for (const [token, record] of captchaStore.entries()) {
    if (record.expiresAt <= now) {
      captchaStore.delete(token);
    }
  }
}

/**
 * Enforces the hard size cap. Expired entries are dropped first; if the store
 * is still over the cap (a burst of still-valid challenges) the oldest entries
 * are evicted in insertion order until it fits. Map iteration order is
 * insertion order, so the first keys are the oldest.
 */
function enforceCaptchaStoreCap(now = Date.now()): void {
  if (captchaStore.size <= CAPTCHA_MAX_ENTRIES) {
    return;
  }
  cleanupExpiredChallenges(now);
  for (const token of captchaStore.keys()) {
    if (captchaStore.size <= CAPTCHA_MAX_ENTRIES) {
      break;
    }
    captchaStore.delete(token);
  }
}

/**
 * Registers a periodic background sweep that prunes expired challenges even
 * when no traffic hits the lazy cleanup path. The timer is `.unref()`-ed so it
 * never keeps the Node process alive, and a `globalThis` guard ensures only one
 * survives HMR. Mirrors the rate-limiter sweep in src/lib/rate-limit.ts.
 */
function registerExpiredChallengeSweep(): void {
  if (globalStore.__captchaSweepRegistered) return;
  globalStore.__captchaSweepRegistered = true;

  const timer = setInterval(() => {
    cleanupExpiredChallenges(Date.now());
  }, CAPTCHA_SWEEP_INTERVAL_MS);
  timer.unref?.();
}

// Register the background sweep once at module init so idle periods still prune
// expired challenges even when no request triggers the lazy cleanup path.
registerExpiredChallengeSweep();

/**
 * Generates a random CAPTCHA answer.
 *
 * SECURITY: the answer is the secret an attacker is trying to guess, so each
 * character is drawn with a CSPRNG. `crypto.randomInt(0, n)` is uniform over
 * `[0, n)` (it rejection-samples internally), so there is no modulo bias even
 * though the alphabet length does not divide a power of two.
 */
function generateCaptchaCode(length = CAPTCHA_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    const index = randomInt(0, CAPTCHA_ALPHABET.length);
    code += CAPTCHA_ALPHABET[index];
  }
  return code;
}

/** Escapes special XML characters for the SVG template. */
function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Renders the CAPTCHA code into an SVG with multiple layers of noise.
 * RATIONALE: We use a combination of linear noise, bezier curves, 
 * and fractal displacement to disrupt automated segmentation.
 */
function renderCaptchaSvgDataUrl(code: string): string {
  const width = 220;
  const height = 72;
  const chars = code.split("");
  const gradientId = `captcha-bg-${randomUUID()}`;
  const filterId = `captcha-filter-${randomUUID()}`;

  const characterLayers = chars
    .map((char, index) => {
      const x = 16 + index * 33 + Math.floor(Math.random() * 10);
      const y = 40 + Math.floor(Math.random() * 18);
      const rotate = -20 + Math.floor(Math.random() * 41);
      const skewX = -12 + Math.floor(Math.random() * 25);
      const skewY = -8 + Math.floor(Math.random() * 17);
      const fontSize = 28 + Math.floor(Math.random() * 10);
      const fontFamily = ["monospace", "serif", "sans-serif"][index % 3];
      const fill = ["#0b3d2e", "#3f1d0d", "#0d2b45", "#4b1e3d"][index % 4];
      return `<text x="${x}" y="${y}" fill="${fill}" font-size="${fontSize}" font-weight="700" font-family="${fontFamily}" transform="rotate(${rotate} ${x} ${y}) skewX(${skewX}) skewY(${skewY})">${escapeSvgText(char)}</text>`;
    })
    .join("");

  const noiseLines = Array.from({ length: 10 }, () => {
    const x1 = Math.floor(Math.random() * width);
    const y1 = Math.floor(Math.random() * height);
    const x2 = Math.floor(Math.random() * width);
    const y2 = Math.floor(Math.random() * height);
    const opacity = (0.2 + Math.random() * 0.35).toFixed(2);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#425466" stroke-width="1.2" opacity="${opacity}" />`;
  }).join("");

  const noiseDots = Array.from({ length: 42 }, () => {
    const cx = Math.floor(Math.random() * width);
    const cy = Math.floor(Math.random() * height);
    const r = (0.7 + Math.random() * 1.8).toFixed(1);
    const opacity = (0.18 + Math.random() * 0.32).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#2f4858" opacity="${opacity}" />`;
  }).join("");

  const noiseCurves = Array.from({ length: 4 }, () => {
    const startY = Math.floor(Math.random() * height);
    const endY = Math.floor(Math.random() * height);
    const c1x = Math.floor(width * (0.2 + Math.random() * 0.2));
    const c1y = Math.floor(Math.random() * height);
    const c2x = Math.floor(width * (0.6 + Math.random() * 0.2));
    const c2y = Math.floor(Math.random() * height);
    const opacity = (0.18 + Math.random() * 0.25).toFixed(2);
    const strokeWidth = (1.2 + Math.random() * 1.4).toFixed(1);
    return `<path d="M 0 ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${width} ${endY}" fill="none" stroke="#5a6c7d" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
  }).join("");

  const opacityBars = Array.from({ length: 3 }, () => {
    const x = Math.floor(Math.random() * (width - 30));
    const y = Math.floor(Math.random() * (height - 10));
    const w = 20 + Math.floor(Math.random() * 45);
    const h = 2 + Math.floor(Math.random() * 4);
    const rotate = -18 + Math.floor(Math.random() * 37);
    const opacity = (0.12 + Math.random() * 0.16).toFixed(2);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#23313f" opacity="${opacity}" transform="rotate(${rotate} ${x} ${y})" />`;
  }).join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="CAPTCHA challenge">
      <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f7f3ea" />
          <stop offset="100%" stop-color="#e6edf5" />
        </linearGradient>
        <filter id="${filterId}" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.11" numOctaves="1" seed="${Math.floor(Math.random() * 9999)}" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="10" ry="10" fill="url(#${gradientId})" />
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="9" ry="9" fill="none" stroke="#9fb3c8" stroke-width="1" />
      ${noiseDots}
      ${noiseLines}
      ${noiseCurves}
      <g filter="url(#${filterId})">
        ${characterLayers}
      </g>
      ${opacityBars}
    </svg>
  `.trim();

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/**
 * Creates and stores a new one-time CAPTCHA challenge for client use.
 */
export function createCaptchaChallenge(): CaptchaChallenge {
  cleanupExpiredChallenges();

  const token = randomUUID();
  const answer = generateCaptchaCode();
  const expiresAt = Date.now() + CAPTCHA_TTL_MS;

  captchaStore.set(token, {
    answer,
    expiresAt
  });

  // Bound memory: drop expired/oldest entries if a burst pushed us over the cap.
  enforceCaptchaStoreCap();

  return {
    token,
    imageDataUrl: renderCaptchaSvgDataUrl(answer),
    expiresInSeconds: Math.floor(CAPTCHA_TTL_MS / 1000),
    prompt: "Enter the letters, numbers, and symbols shown in the image."
  };
}

/**
 * Validates and consumes a CAPTCHA challenge.
 * 
 * DESIGN RATIONALE: Challenges are single-use. We delete the record 
 * from the store immediately upon retrieval, even if validation fails. 
 * This prevents brute-force attempts on a single challenge image.
 */
export function verifyCaptchaSubmission(input: {
  captchaToken?: unknown;
  captchaAnswer?: unknown;
}): CaptchaValidationResult {
  cleanupExpiredChallenges();

  const token = String(input.captchaToken ?? "").trim();
  const answer = normalizeCaptchaAnswer(input.captchaAnswer);

  if (!token || !answer) {
    return { ok: false, code: "MISSING", message: "CAPTCHA token and answer are required." };
  }

  const record = captchaStore.get(token);
  if (!record) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "CAPTCHA challenge was not found or has already been used. Please try a new challenge."
    };
  }

  captchaStore.delete(token);

  if (record.expiresAt <= Date.now()) {
    return { ok: false, code: "EXPIRED", message: "CAPTCHA challenge expired. Please try a new challenge." };
  }

  if (record.answer !== answer) {
    return { ok: false, code: "INVALID", message: "CAPTCHA answer was incorrect. Please try a new challenge." };
  }

  return { ok: true };
}

/**
 * High-level Atomic Anti-Bot Guard.
 * 
 * Logic:
 * 1. Honeypot Check: Reject immediately if the invisible 'website' field is filled.
 * 2. Rate Limit: Throttles attempts by IP to prevent CAPTCHA-solving-farm attacks.
 * 3. Validation: Consumes the token and verifies the answer.
 */
export function verifyCaptchaGuard(input: {
  body: unknown;
  headers: Headers;
  scope: string;
  limit?: number;
  windowMs?: number;
}): CaptchaGuardResult {
  const body = (input.body ?? null) as {
    website?: unknown;
    captchaToken?: unknown;
    captchaAnswer?: unknown;
  } | null;

  // 1. Honeypot check
  const honeypot = String(body?.website ?? "").trim();
  if (honeypot) {
    return {
      ok: false,
      status: 400,
      code: "HONEYPOT_FILLED",
      message: "Unable to process submission."
    };
  }

  // 2. IP Throttling
  const rateLimit: RateLimitResult = consumeRateLimit({
    key: `captcha:${input.scope}:${getRequestIpFromHeaders(input.headers)}`,
    limit: input.limit ?? 20,
    windowMs: input.windowMs ?? 10 * 60 * 1000
  });

  if (!rateLimit.allowed) {
    return {
      ok: false,
      status: 429,
      code: "CAPTCHA_RATE_LIMITED",
      message: "Too many verification attempts. Please try again shortly.",
      retryAfterSeconds: rateLimit.retryAfterSeconds
    };
  }

  // 3. Explicit Bypass (vitest auto-sets VITEST; dev/staging can opt in).
  // RATIONALE: Never key the bypass on NODE_ENV so a misconfigured production
  // process can never silently fail open.
  if (process.env.VITEST != null || process.env.CAPTCHA_TEST_BYPASS === "1") {
    return { ok: true };
  }

  // 4. Verification
  const captcha = verifyCaptchaSubmission({
    captchaToken: body?.captchaToken,
    captchaAnswer: body?.captchaAnswer
  });

  if (!captcha.ok) {
    return {
      ok: false,
      status: 400,
      code: captcha.code,
      message: captcha.message
    };
  }

  return { ok: true };
}
