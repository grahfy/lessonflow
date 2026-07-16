/**
 * Learning Material Classification & Security
 * 
 * Provides domain logic for handling student file uploads, MIME type 
 * resolution, and secure storage key generation.
 * 
 * DESIGN RATIONALE:
 * 1. Explicit Allow-Listing: We strictly map extensions to known Safe 
 *    MIME types. This prevents users from uploading deceptive or 
 *    executable files.
 * 2. Cross-Site Scripting (XSS) Prevention: SVG files are explicitly 
 *    excluded from the `IMAGE_MIME_TYPES` enum because they can contain 
 *    embedded JavaScript and event handlers which would execute when 
 *    served directly to the student portal.
 * 3. Deterministic Storage Keys: Keys are generated using a namespaced 
 *    prefix (`customerId/bookingScope/timestamp-uuid.ext`) ensuring strict 
 *    multi-tenant isolation at the filesystem/bucket level.
 */

import crypto from "node:crypto";
import path from "node:path";
import { LearningMaterialType } from "@/generated/prisma/client";
import { EXTENSION_TO_MIME } from "@/lib/student-portal/material-classification";

// The classification/allow-list half lives in material-classification.ts (a
// pure module client bundles can import — node:crypto/node:path above are an
// UnhandledSchemeError in client bundles). Re-exported here so every existing
// server import keeps working and the acceptance set has ONE definition.
export {
  classifyLearningMaterialFile,
  getLearningMaterialAcceptValue,
  sanitizeLearningMaterialTitle
} from "@/lib/student-portal/material-classification";

/**
 * Builds a unique storage key scoped to customer and appointment ownership.
 */
export function buildLearningMaterialStorageKey(input: {
  customerId: string;
  bookingId?: string | null;
  extension: string;
}): string {
  const suffix = `${Date.now()}-${crypto.randomUUID()}`;
  const bookingScope = input.bookingId?.trim() ? input.bookingId : "general";
  return `${input.customerId}/${bookingScope}/${suffix}${input.extension}`;
}

/**
 * Builds a unique storage key in the shared, non-customer-scoped `library/`
 * namespace for shared-library items.
 *
 * RATIONALE: Library items are not tied to a customer, so their keys live under
 * a dedicated `library/` prefix that can never collide with the
 * `{customerId}/{bookingScope}/timestamp-uuid.ext` keys produced by
 * buildLearningMaterialStorageKey (which always start with a customer id).
 */
export function buildLibraryItemStorageKey(input: { extension: string }): string {
  const suffix = `${Date.now()}-${crypto.randomUUID()}`;
  return `library/${suffix}${input.extension}`;
}

/**
 * Produces a download filename from metadata while preserving extension semantics.
 */
export function buildLearningMaterialDownloadFilename(input: {
  title: string;
  materialType: LearningMaterialType;
  mimeType: string;
  originalFilename?: string | null;
}): string {
  const base = input.title
    .trim()
    .replace(/[^a-zA-Z0-9\-_\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "lesson-material";

  const FALLBACK_EXT: Record<string, string> = { pdf: ".pdf", image: ".jpg", audio: ".mp3", guitar_pro: ".gp" };
  const ext =
    inferExtensionFromMime(input.mimeType) ||
    sanitizedExtensionFromOriginalFilename(input.originalFilename) ||
    FALLBACK_EXT[input.materialType] ||
    ".bin";
  return `${base}${ext}`;
}

/**
 * Extracts a header-safe extension from a stored original upload filename.
 * The only source of a real extension for MIME types that never reverse-map
 * (Guitar Pro files arrive as application/octet-stream), so it sits between
 * MIME inference and the per-type fallback in the download-name resolution.
 */
function sanitizedExtensionFromOriginalFilename(originalFilename: string | null | undefined): string | null {
  if (!originalFilename) {
    return null;
  }
  const ext = path.extname(originalFilename.trim()).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : null;
}

/**
 * Best-effort MIME to extension mapper for content-disposition download names.
 */
function inferExtensionFromMime(mimeType: string): string | null {
  const normalized = mimeType.trim().toLowerCase();
  const entry = Object.entries(EXTENSION_TO_MIME).find(([, mime]) => mime === normalized);
  return entry?.[0] ?? null;
}
