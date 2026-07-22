/**
 * Zod validation schema for admin-authored promo popups (SitePopup), plus
 * the bodyHtml sanitizer. Follows the pattern established by chord-contract.ts.
 */

import { z } from "zod";
import { generateHTML, generateJSON } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";

import { PopupAnimation, PopupFormFactor, PopupImagePlacement, PopupRepeatPolicy } from "@/generated/prisma/client";

/**
 * Extensions used ONLY to sanitize popup body HTML via a schema-constrained
 * parse/re-serialize round-trip (`@tiptap/html`'s generateJSON -> generateHTML).
 * This is what actually does the sanitizing:
 * - `generateJSON` parses the raw HTML with ProseMirror's schema-validated DOM
 *   parser, so any tag/attribute StarterKit doesn't define (`<script>`,
 *   `<iframe>`, `<style>`, `on*` handlers) is silently dropped, never even
 *   entering the parsed document.
 * - StarterKit v3 bundles `@tiptap/extension-link`, whose default href
 *   validation rejects `javascript:`/`data:`/`vbscript:` schemes (including
 *   whitespace-padded and mixed-case variants) at parse time, dropping the
 *   mark entirely rather than keeping a neutered link. Verified empirically
 *   (script tags, `onclick`, `<iframe>`, and disguised `javascript:` hrefs all
 *   vanish; `http:`/`https:`/`mailto:`/relative links survive) before relying
 *   on it instead of hand-rolling the same check.
 * - `generateHTML` re-serializes only the surviving, validated JSON, so the
 *   stored string can never contain what parsing discarded.
 *
 * Sanitizing here (on the way in, before the row is ever written) rather than
 * on the way out means every future consumer — the public popup renderer,
 * any admin preview — reads already-safe HTML with nothing to remember.
 */
const BODY_HTML_SANITIZE_EXTENSIONS = [StarterKit];

export function sanitizePopupBodyHtml(html: string): string {
  const json = generateJSON(html, BODY_HTML_SANITIZE_EXTENSIONS);
  return generateHTML(json, BODY_HTML_SANITIZE_EXTENSIONS);
}

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, "Must be a hex color like #fff or #ffffff.");

/** True for a same-origin path (`/book`); false for a protocol-relative one (`//host`), which browsers resolve as absolute. */
function isSameOriginPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

/**
 * A URL field is either a same-origin path (e.g. `/book`, so a popup CTA can
 * link to another page on this site) or an absolute URL whose scheme is in
 * `allowedProtocols`. An unconstrained href is an open-redirect/`javascript:`
 * vector on a publicly rendered popup, so every scheme not explicitly listed
 * is rejected outright rather than passed through.
 */
function urlOrPathSchema(allowedProtocols: readonly string[], label: string) {
  const protocolSet = new Set(allowedProtocols);
  return z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => {
      if (isSameOriginPath(value)) {
        return true;
      }
      try {
        return protocolSet.has(new URL(value).protocol);
      } catch {
        return false;
      }
    }, `${label} must be a relative path or an absolute URL starting with ${allowedProtocols.join("/")}.`);
}

const ctaUrlSchema = urlOrPathSchema(["http:", "https:", "mailto:"], "ctaUrl");
const imageUrlSchema = urlOrPathSchema(["http:", "https:"], "imageUrl");

const sitePopupShape = z.object({
  title: z.string().trim().min(1).max(150),
  enabled: z.boolean().default(false),
  heading: z.string().trim().min(1).max(150),
  bodyHtml: z.string().trim().min(1).max(20000),
  imageUrl: imageUrlSchema.optional().nullable(),
  imageAlt: z.string().trim().max(200).optional().nullable(),
  ctaLabel: z.string().trim().max(50).optional().nullable(),
  ctaUrl: ctaUrlSchema.optional().nullable(),
  formFactor: z.nativeEnum(PopupFormFactor).default(PopupFormFactor.modal),
  animation: z.nativeEnum(PopupAnimation).default(PopupAnimation.fade),
  backgroundColor: hexColorSchema.default("#ffffff"),
  textColor: hexColorSchema.default("#111111"),
  buttonBackgroundColor: hexColorSchema.default("#2247d8"),
  buttonTextColor: hexColorSchema.default("#ffffff"),
  widthPx: z.number().int().min(100).max(1200).optional().nullable(),
  cornerRadiusPx: z.number().int().min(0).max(100).optional().nullable(),
  imagePlacement: z.nativeEnum(PopupImagePlacement).default(PopupImagePlacement.none),
  startAt: z.coerce.date().optional().nullable(),
  endAt: z.coerce.date().optional().nullable(),
  targetPaths: z.array(z.string().trim().min(1).max(200)).max(50).optional().nullable(),
  delaySeconds: z.number().int().min(0).max(300).default(0),
  repeatPolicy: z.nativeEnum(PopupRepeatPolicy).default(PopupRepeatPolicy.session),
  repeatDays: z.number().int().min(1).max(365).optional().nullable()
});

/**
 * Full create/update contract for a SitePopup.
 *
 * RATIONALE for one full schema on both create and update (no `.partial()`
 * update variant, unlike chord-contract.ts's `updateChordInputSchema`):
 * `repeatDays` is only meaningful — and required — when `repeatPolicy` is
 * `"days"`, a cross-field rule a partial payload can't validate without first
 * reading the row's current `repeatPolicy` back out of the database. The
 * admin popup form already round-trips the full record on every save, so
 * requiring the full shape on update too is simpler and avoids that lookup.
 */
export const sitePopupInputSchema = sitePopupShape
  .superRefine((data, ctx) => {
    if (data.repeatPolicy === PopupRepeatPolicy.days && !data.repeatDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repeatDays"],
        message: 'repeatDays is required when repeatPolicy is "days".'
      });
    }
  })
  .transform((data) => ({
    ...data,
    // Only ever read for the "days" policy; null it out for every other
    // policy so a stale value from a previous edit can't linger unused.
    repeatDays: data.repeatPolicy === PopupRepeatPolicy.days ? (data.repeatDays as number) : null,
    bodyHtml: sanitizePopupBodyHtml(data.bodyHtml)
  }));

export type SitePopupInput = z.infer<typeof sitePopupInputSchema>;
