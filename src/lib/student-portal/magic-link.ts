/**
 * Magic-Link Login Support
 *
 * Complements the stateless token crypto in `session.ts` with the two stateful
 * concerns of the passwordless flow:
 *
 * 1. Single-use enforcement — an in-memory consumed-nonce set (scoped to
 *    `globalThis` so it survives HMR), mirroring the in-memory design of
 *    `rate-limit.ts` for the single-droplet deployment. A nonce can be redeemed
 *    exactly once while the process is alive; entries auto-expire at the token's
 *    own expiry so the set stays bounded.
 * 2. Presentation — the verify URL and the branded HTML email body, built with
 *    the shared email layout so magic-link mail matches every other message.
 */

import { escapeHtml, renderEmailLayout } from "@/lib/email/layout";
import { PUBLIC_BRAND_NAME } from "@/lib/branding";

/**
 * Global consumed-nonce store.
 * RATIONALE: `globalThis` keeps the set alive across Next.js hot reloads, just
 * like the rate-limit store. Values are the token expiry (epoch ms) used for
 * lazy pruning.
 */
const globalStore = globalThis as unknown as {
  __magicLinkConsumed?: Map<string, number>;
};

const consumed = globalStore.__magicLinkConsumed ?? new Map<string, number>();
if (!globalStore.__magicLinkConsumed) {
  globalStore.__magicLinkConsumed = consumed;
}

/**
 * Atomically marks a magic-link nonce as consumed.
 *
 * @returns `true` when the nonce was fresh (now consumed), `false` when it had
 *   already been redeemed — i.e. a replay that must be rejected.
 */
export function consumeMagicLinkNonce(nonce: string, expiresAtMs: number): boolean {
  const now = Date.now();

  // Lazy prune: drop nonces whose tokens have already expired.
  for (const [key, exp] of consumed) {
    if (exp <= now) {
      consumed.delete(key);
    }
  }

  if (consumed.has(nonce)) {
    return false;
  }
  consumed.set(nonce, expiresAtMs);
  return true;
}

/** Path (relative to the site origin) that redeems a magic-link token. */
export const STUDENT_MAGIC_LINK_VERIFY_PATH = "/student/magic-link/verify";

/**
 * Builds the absolute one-tap login URL a student clicks from their email.
 *
 * @param origin - Site origin (e.g. from `getPublicSiteUrl()`), trailing slash tolerated.
 * @param token - Signed magic-link token.
 */
export function buildStudentMagicLinkVerifyUrl(origin: string, token: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${STUDENT_MAGIC_LINK_VERIFY_PATH}?token=${encodeURIComponent(token)}`;
}

/**
 * Renders the branded magic-link email using the shared email layout so the
 * message matches invoice/booking/credential mail (signature injected downstream
 * by `sendEmail`).
 */
export function buildStudentMagicLinkEmail(input: { name: string; verifyUrl: string; ttlMinutes: number }): {
  subject: string;
  html: string;
} {
  const greetingName = input.name.trim() || "there";
  return {
    subject: `Your ${PUBLIC_BRAND_NAME} student portal login link`,
    html: renderEmailLayout({
      title: "Your one-tap login link",
      previewText: "Tap to sign in to your student portal — no password required.",
      leadHtml:
        "Tap the button below to sign in to your student portal. No password or CAPTCHA required.",
      contentHtml: `
        <p style="margin:0 0 12px;">Hi ${escapeHtml(greetingName)},</p>
        <p style="margin:0 0 18px;">Use the button below to open your student portal and view upcoming lessons, previous appointments, and any learning materials shared with you.</p>

        <p style="margin:0 0 18px;">
          <a href="${escapeHtml(input.verifyUrl)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#2247d8;color:#ffffff;font-weight:700;text-decoration:none;">Sign in to portal</a>
        </p>

        <p style="margin:0 0 12px;">Or copy and paste this link into your browser:</p>
        <p style="margin:0 0 18px;word-break:break-all;"><a href="${escapeHtml(input.verifyUrl)}" style="color:#2247d8;">${escapeHtml(input.verifyUrl)}</a></p>

        <p style="margin:0 0 10px;color:#5b6b86;font-size:14px;">This link expires in ${input.ttlMinutes} minutes and can only be used once. If you did not request it, you can safely ignore this email.</p>
      `
    })
  };
}
