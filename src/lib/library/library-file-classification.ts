/**
 * Library-only File Classification
 *
 * Wraps the shared learning-material classifier with the Guitar Pro extension
 * check so ONLY the shared library can accept `.gp*` files — the per-customer
 * upload routes keep calling the unmodified `classifyLearningMaterialFile` and
 * continue to reject them.
 *
 * DESIGN RATIONALE:
 * 1. GP detection is extension-based by necessity: browsers report Guitar Pro
 *    files as `application/octet-stream` (or an empty string), so MIME is
 *    ignored for the GP branch and everything else delegates to the base
 *    classifier untouched.
 * 2. `normalizeOriginalFilename` is THE single truncation rule for
 *    `LibraryItem.originalFilename` (`@db.VarChar(255)`): the upload create,
 *    the replace-file update, and the duplicate probe must all store/compare
 *    the same normalized value or dedupe silently diverges.
 * 3. This module is imported by the client upload queue for pre-filtering
 *    (`precheckLibraryFile`), so it must stay free of Node-only imports. The
 *    client precheck only saves bandwidth and surfaces skip reasons early —
 *    the server classifier and size guard remain the authority.
 */

import { LEARNING_MATERIAL_ACCEPT } from "@/lib/admin/types";
import { classifyLearningMaterialFile } from "@/lib/student-portal/material-classification";
import type { LearningMaterialType } from "@/generated/prisma/client";

/** Guitar Pro extensions accepted by the library (lowercase, dot-prefixed). */
export const GP_EXTENSIONS: ReadonlySet<string> = new Set([".gp3", ".gp4", ".gp5", ".gpx", ".gp"]);

/** Library upload accept attribute: the shared learning-material set plus Guitar Pro. */
export const LIBRARY_ACCEPT = `${LEARNING_MATERIAL_ACCEPT},.gp3,.gp4,.gp5,.gpx,.gp`;

/** Maximum accepted file size, mirroring the server route's per-file guard. */
export const MAX_LIBRARY_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/**
 * OS/sync-tool artifacts silently dropped from dropped folders. Matched against
 * the base filename (case-insensitive) so junk nested anywhere in a tree is
 * caught regardless of how the traversal reports paths.
 */
export const JUNK_FILE_RULES: ReadonlyArray<{
  reason: string;
  matches: (baseName: string) => boolean;
}> = [
  { reason: "macOS Finder metadata (.DS_Store)", matches: (name) => name === ".ds_store" },
  { reason: "macOS AppleDouble resource fork (._*)", matches: (name) => name.startsWith("._") },
  { reason: "Windows thumbnail cache (Thumbs.db)", matches: (name) => name === "thumbs.db" },
  { reason: "Windows folder settings (desktop.ini)", matches: (name) => name === "desktop.ini" },
  { reason: "Dropbox sync metadata (.dropbox)", matches: (name) => name === ".dropbox" }
];

/**
 * THE single truncation rule for LibraryItem.originalFilename. Store-side and
 * duplicate-probe-side values must both pass through here (Fork B).
 */
export function normalizeOriginalFilename(name: string): string {
  return name.trim().slice(0, 255);
}

/** True when the filename is an OS/sync artifact the batch should silently ignore. */
export function isJunkLibraryFile(fileName: string): boolean {
  const baseName = baseNameOf(fileName).toLowerCase();
  return JUNK_FILE_RULES.some((rule) => rule.matches(baseName));
}

/**
 * Classifies a library upload: Guitar Pro extensions first (MIME ignored — see
 * module rationale), everything else delegated to the shared classifier so the
 * base accept set has exactly one definition.
 */
export function classifyLibraryFile(input: { fileName: string; mimeType: string }): {
  materialType: LearningMaterialType;
  mimeType: string;
  extension: string;
} | null {
  const ext = extensionOf(input.fileName);
  if (GP_EXTENSIONS.has(ext)) {
    return {
      materialType: "guitar_pro",
      mimeType: "application/octet-stream",
      extension: ext
    };
  }
  return classifyLearningMaterialFile(input);
}

export type LibraryFilePrecheck =
  | { kind: "accept" }
  | { kind: "junk" }
  | { kind: "skip"; code: "unsupported_type" | "too_large" | "empty"; reason: string };

/**
 * Client-side pre-filter for the bulk upload queue: junk is silently dropped,
 * unsupported/oversize/empty files get a per-file skip reason without spending
 * a request. Everything accepted here is still re-validated server-side.
 */
export function precheckLibraryFile(name: string, type: string, size: number): LibraryFilePrecheck {
  if (isJunkLibraryFile(name)) {
    return { kind: "junk" };
  }
  if (!classifyLibraryFile({ fileName: name, mimeType: type })) {
    return {
      kind: "skip",
      code: "unsupported_type",
      reason: "Unsupported file type. Supported: PDF, common audio, images (JPEG, PNG, GIF, WebP), and Guitar Pro (.gp3–.gp5, .gpx, .gp)."
    };
  }
  if (size <= 0) {
    return { kind: "skip", code: "empty", reason: "File is empty." };
  }
  if (size > MAX_LIBRARY_FILE_SIZE_BYTES) {
    return { kind: "skip", code: "too_large", reason: "File exceeds the 100MB limit." };
  }
  return { kind: "accept" };
}

/** Last path segment of a name that may contain / or \ separators. */
function baseNameOf(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

/**
 * Lowercased dot-prefixed extension; "" for dotfiles and extension-less names.
 * Trimmed first so padded OS filenames classify the same value that
 * normalizeOriginalFilename stores.
 */
function extensionOf(fileName: string): string {
  const baseName = baseNameOf(fileName).trim();
  const dot = baseName.lastIndexOf(".");
  if (dot <= 0 || dot === baseName.length - 1) {
    return "";
  }
  return baseName.slice(dot).toLowerCase();
}
