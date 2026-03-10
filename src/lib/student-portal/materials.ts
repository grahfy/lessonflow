import crypto from "node:crypto";
import path from "node:path";
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

// NOTE: SVG is intentionally excluded because SVG files can contain embedded
// scripts and event handlers that pose XSS risks when served inline.
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp"
]);

const EXTENSION_TO_MIME: Record<string, string> = {
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
  const ext = path.extname(input.fileName || "").toLowerCase();
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
 * Produces a download filename from metadata while preserving extension semantics.
 */
export function buildLearningMaterialDownloadFilename(input: {
  title: string;
  materialType: LearningMaterialType;
  mimeType: string;
}): string {
  const base = input.title
    .trim()
    .replace(/[^a-zA-Z0-9\-_\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "lesson-material";

  const FALLBACK_EXT: Record<string, string> = { pdf: ".pdf", image: ".jpg", audio: ".mp3" };
  const ext = inferExtensionFromMime(input.mimeType) || FALLBACK_EXT[input.materialType] || ".bin";
  return `${base}${ext}`;
}

/**
 * Best-effort MIME to extension mapper for content-disposition download names.
 */
function inferExtensionFromMime(mimeType: string): string | null {
  const normalized = mimeType.trim().toLowerCase();
  const entry = Object.entries(EXTENSION_TO_MIME).find(([, mime]) => mime === normalized);
  return entry?.[0] ?? null;
}
