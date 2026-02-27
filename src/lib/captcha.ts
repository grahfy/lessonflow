import { randomUUID } from "node:crypto";

import { consumeRateLimit, getRequestIpFromHeaders, type RateLimitResult } from "@/lib/rate-limit";

/**
 * In-memory CAPTCHA challenge store.
 *
 * This keeps implementation simple and fast for the current app deployment model.
 * Challenges are short-lived and single-use to reduce replay attempts.
 */
type CaptchaRecord = {
  answer: string;
  expiresAt: number;
};

/**
 * Public challenge payload returned to the client.
 *
 * The answer is never returned. The image is delivered as a data URL so forms can
 * render it directly without a second request.
 */
export type CaptchaChallenge = {
  token: string;
  imageDataUrl: string;
  expiresInSeconds: number;
  prompt: string;
};

/**
 * Server-side validation result for a submitted CAPTCHA answer.
 */
export type CaptchaValidationResult =
  | { ok: true }
  | { ok: false; code: "MISSING" | "NOT_FOUND" | "EXPIRED" | "INVALID"; message: string };

/**
 * Shared anti-bot gate result used by CAPTCHA-protected routes.
 */
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
const CAPTCHA_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*+-=?";
const captchaStore = new Map<string, CaptchaRecord>();

/**
 * Normalizes user-entered values so matching is case-insensitive and whitespace-safe.
 */
function normalizeCaptchaAnswer(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Removes expired challenges opportunistically during create/verify calls.
 *
 * This avoids introducing background timers while keeping the in-memory map bounded.
 */
function cleanupExpiredChallenges(now = Date.now()): void {
  for (const [token, record] of captchaStore.entries()) {
    if (record.expiresAt <= now) {
      captchaStore.delete(token);
    }
  }
}

/**
 * Generates a short human-readable CAPTCHA code using an alphabet that avoids
 * visually ambiguous characters like 0/O and 1/I.
 */
function generateCaptchaCode(length = CAPTCHA_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * CAPTCHA_ALPHABET.length);
    code += CAPTCHA_ALPHABET[index];
  }
  return code;
}

/**
 * Escapes text for safe inclusion in SVG/XML attributes and text nodes.
 */
function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Renders the CAPTCHA image as an SVG with light noise lines and jittered character placement.
 *
 * SVG keeps the implementation dependency-free and produces crisp output across devices.
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

  const occlusionBars = Array.from({ length: 3 }, () => {
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
      ${occlusionBars}
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
 * The challenge is single-use on any verification attempt (valid or invalid) so repeated guessing
 * against the same image is not possible.
 */
export function verifyCaptchaSubmission(input: {
  captchaToken?: unknown;
  captchaAnswer?: unknown;
}): CaptchaValidationResult {
  cleanupExpiredChallenges();

  const token = String(input.captchaToken ?? "").trim();
  const answer = normalizeCaptchaAnswer(input.captchaAnswer);

  if (!token || !answer) {
    return {
      ok: false,
      code: "MISSING",
      message: "CAPTCHA token and answer are required."
    };
  }

  const record = captchaStore.get(token);
  if (!record) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "CAPTCHA challenge was not found or has already been used. Please try a new challenge."
    };
  }

  // Always consume once retrieved to prevent repeated attempts against one challenge image.
  captchaStore.delete(token);

  if (record.expiresAt <= Date.now()) {
    return {
      ok: false,
      code: "EXPIRED",
      message: "CAPTCHA challenge expired. Please try a new challenge."
    };
  }

  if (record.answer !== answer) {
    return {
      ok: false,
      code: "INVALID",
      message: "CAPTCHA answer was incorrect. Please try a new challenge."
    };
  }

  return { ok: true };
}

/**
 * Performs the full anti-bot gate used by protected routes:
 * 1) reject honeypot-filled submissions
 * 2) rate-limit CAPTCHA attempts by IP and scope
 * 3) verify and consume CAPTCHA token/answer
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

  const honeypot = String(body?.website ?? "").trim();
  if (honeypot) {
    return {
      ok: false,
      status: 400,
      code: "HONEYPOT_FILLED",
      message: "Unable to process submission."
    };
  }

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

  // Bypass CAPTCHA verification in test environment
  if (process.env.NODE_ENV === "test") {
    return { ok: true };
  }

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
