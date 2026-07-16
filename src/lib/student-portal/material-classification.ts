/**
 * Learning Material Classification (pure)
 *
 * The classification/allow-list half of the old `materials.ts`, split into a
 * module with NO Node-only imports so client code (the bulk-upload queue's
 * pre-filter via `classifyLibraryFile`) can bundle it — `node:crypto` /
 * `node:path` imports are an UnhandledSchemeError in client bundles.
 * `materials.ts` re-exports everything here, so existing server imports are
 * unchanged and the acceptance set still has exactly one definition.
 *
 * DESIGN RATIONALE (unchanged from materials.ts):
 * 1. Explicit Allow-Listing: extensions map to known safe MIME types only.
 * 2. XSS Prevention: SVG is deliberately absent from IMAGE_MIME_TYPES —
 *    SVGs can embed scripts that execute when served to the student portal.
 */

import { LearningMaterialType } from "@/generated/prisma/client";

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/flac"
]);

const PDF_MIME_TYPES = new Set(["application/pdf"]);

// RATIONALE: SVG is intentionally excluded to prevent XSS.
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp"
]);

/** Shared by the classifier here and the MIME→extension reverse map in materials.ts. */
export const EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp"
};

/**
 * Pure clone of `path.extname` for the inputs this module sees (verified
 * parity: dotfiles → "", trailing dot → ".", no backslash splitting — exactly
 * posix `path.extname`), so classification needs no `node:path` import.
 */
function extensionOf(fileName: string): string {
  const base = fileName.slice(fileName.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot) : "";
}

/**
 * Returns a stable input-accept string used by admin upload forms.
 */
export function getLearningMaterialAcceptValue(): string {
  return [
    ".pdf",
    ".mp3",
    ".m4a",
    ".wav",
    ".ogg",
    ".webm",
    ".aac",
    ".flac",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    "application/pdf",
    "audio/*",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp"
  ].join(",");
}

/**
 * Normalizes and bounds admin-entered learning-material titles.
 */
export function sanitizeLearningMaterialTitle(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "Untitled lesson material";
  }
  return trimmed.slice(0, 180);
}

/**
 * Determines whether the uploaded file is supported and maps it to DB enum values.
 * Supports PDF documents, common audio formats, and raster image types.
 */
export function classifyLearningMaterialFile(input: {
  fileName: string;
  mimeType: string;
}): {
  materialType: LearningMaterialType;
  mimeType: string;
  extension: string;
} | null {
  const originalMime = input.mimeType.trim().toLowerCase();
  const ext = extensionOf(input.fileName || "").toLowerCase();
  const inferredMime = EXTENSION_TO_MIME[ext];
  const resolvedMime = originalMime || inferredMime || "";

  if (PDF_MIME_TYPES.has(resolvedMime) || ext === ".pdf") {
    return {
      materialType: "pdf",
      mimeType: "application/pdf",
      extension: ".pdf"
    };
  }

  if (AUDIO_MIME_TYPES.has(resolvedMime)) {
    return {
      materialType: "audio",
      mimeType: resolvedMime,
      extension: ext || ".mp3"
    };
  }

  if (ext && EXTENSION_TO_MIME[ext] && AUDIO_MIME_TYPES.has(EXTENSION_TO_MIME[ext])) {
    return {
      materialType: "audio",
      mimeType: EXTENSION_TO_MIME[ext],
      extension: ext
    };
  }

  // Image classification — check resolved MIME first, then fall back to extension lookup.
  if (IMAGE_MIME_TYPES.has(resolvedMime)) {
    return {
      materialType: "image",
      mimeType: resolvedMime,
      extension: ext || ".jpg"
    };
  }

  if (ext && EXTENSION_TO_MIME[ext] && IMAGE_MIME_TYPES.has(EXTENSION_TO_MIME[ext])) {
    return {
      materialType: "image",
      mimeType: EXTENSION_TO_MIME[ext],
      extension: ext
    };
  }

  return null;
}
