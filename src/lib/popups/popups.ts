/**
 * SitePopup CRUD service, the shared owner-only route guard for popup admin
 * routes, and single-image storage for a popup's `imageUrl`. Mirrors
 * chords.ts for CRUD and note-images.ts for mixing Prisma persistence with
 * on-disk storage in one module.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { resolveProductionAwareStorageRoot } from "@/lib/runtime-paths";
import { isFilesystemNotFoundError, rethrowAsStoragePermissionDeniedError } from "@/lib/storage-errors";
import { dateTimeLocalToDate, toDateKey } from "@/lib/time";
import type { AdminUser, Prisma } from "@/generated/prisma/client";
import { Prisma as PrismaNamespace } from "@/generated/prisma/client";
import type { SitePopupInput } from "./popup-contract";

/**
 * AC-26: every popup admin route is owner-only. Unlike `requireOwnerFromRequest`
 * (which collapses "no session" and "a real but non-owner admin" into a
 * single null), this keeps them apart so each gets the correct status: 401
 * for no/invalid session, 403 for a real session lacking owner privilege.
 */
export async function requireOwnerAdminOrResponse(
  request: NextRequest
): Promise<{ admin: AdminUser } | { response: NextResponse }> {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isOwnerAdmin(admin)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { admin };
}

function toTargetPathsJson(targetPaths: string[] | null | undefined): Prisma.InputJsonValue | typeof PrismaNamespace.JsonNull {
  if (!targetPaths || targetPaths.length === 0) {
    return PrismaNamespace.JsonNull;
  }
  return targetPaths as Prisma.InputJsonValue;
}

export async function listPopups() {
  return prisma.sitePopup.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getPopup(id: string) {
  return prisma.sitePopup.findUnique({ where: { id } });
}

export async function createPopup(input: SitePopupInput, createdById: string) {
  return prisma.sitePopup.create({
    data: {
      ...input,
      targetPaths: toTargetPathsJson(input.targetPaths),
      createdById
    }
  });
}

export async function updatePopup(id: string, input: SitePopupInput) {
  return prisma.sitePopup.update({
    where: { id },
    data: {
      ...input,
      targetPaths: toTargetPathsJson(input.targetPaths)
    }
  });
}

/**
 * Real delete — SitePopup has no `isArchived`/archive flag (checked the
 * schema; `enabled` is a display toggle, not a soft-delete marker), so
 * there's no existing convention to follow here. `PopupDayStat` rows cascade
 * via the schema's `onDelete: Cascade`; the stored image file does not, so
 * it is cleaned up here as a best-effort step (an orphaned file after a
 * failed cleanup is a disk-hygiene gap, not a correctness bug).
 */
export async function deletePopup(id: string) {
  const popup = await prisma.sitePopup.delete({ where: { id } });
  await deletePopupImageFile(id).catch(() => undefined);
  return popup;
}

export async function setPopupImage(id: string, imageUrl: string | null) {
  return prisma.sitePopup.update({ where: { id }, data: { imageUrl } });
}

// --- Popup day stats (AC-44) ---------------------------------------------

export const POPUP_DAY_STATS_LOOKBACK_DAYS = 30;

export type PopupDayStatPoint = {
  /** `YYYY-MM-DD` in the app's business timezone, matching PopupDayStat.day. */
  date: string;
  impressions: number;
  clicks: number;
  dismissals: number;
};

/** Subtracts calendar days from a `YYYY-MM-DD` key without drifting across DST (pure calendar-date arithmetic, no clock time involved). */
function subtractCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - days);
  return utc.toISOString().slice(0, 10);
}

/**
 * Last `POPUP_DAY_STATS_LOOKBACK_DAYS` days of stats for a popup, oldest
 * first and zero-filled so the admin chart gets a continuous date range
 * instead of gaps on quiet days — a fixed lookback window (mirroring
 * `getAnalyticsDashboard`'s fixed, non-caller-configurable windows) rather
 * than every `PopupDayStat` row ever recorded.
 *
 * Date keys are computed via `toDateKey`/`dateTimeLocalToDate` (business
 * timezone), the exact pair the public stats-recording route uses to stamp
 * `day`, so a row always lines up with the calendar date it was actually
 * recorded under.
 */
export async function getPopupDayStats(popupId: string): Promise<PopupDayStatPoint[]> {
  const todayKey = toDateKey(new Date());
  const dateKeys = Array.from({ length: POPUP_DAY_STATS_LOOKBACK_DAYS }, (_, i) =>
    subtractCalendarDays(todayKey, POPUP_DAY_STATS_LOOKBACK_DAYS - 1 - i)
  );

  const earliestDay = dateTimeLocalToDate(`${dateKeys[0]}T00:00`);
  const rows = await prisma.popupDayStat.findMany({
    where: { popupId, ...(earliestDay ? { day: { gte: earliestDay } } : {}) },
    orderBy: { day: "asc" }
  });
  const byDateKey = new Map(rows.map((row) => [toDateKey(row.day), row]));

  return dateKeys.map((date) => {
    const row = byDateKey.get(date);
    return {
      date,
      impressions: row?.impressions ?? 0,
      clicks: row?.clicks ?? 0,
      dismissals: row?.dismissals ?? 0
    };
  });
}

// --- Popup image storage -----------------------------------------------
//
// One image per popup, always written to the same path (no extension, no
// random suffix): a re-upload just overwrites it, so there is never a stale
// file from a previous upload to separately track or delete. Content-type is
// re-derived from the bytes (via sharp) wherever the image is served, rather
// than stored in a new schema column — SitePopup only has a plain `imageUrl`
// string (unlike AdminUser.profilePhotoStorageKey/MimeType or
// BookingNoteImage), so this is the workaround chosen to avoid needing one;
// flagged back to the team for a possible schema addition.

export const MAX_POPUP_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const SHARP_FORMAT_TO_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp"
};

export const ALLOWED_POPUP_IMAGE_MIME_TYPES = new Set(Object.values(SHARP_FORMAT_TO_MIME));

const DEFAULT_LOCAL_ROOT = ".data/popup-images";
const PRODUCTION_LOCAL_ROOT = "/var/www/lessonflow/data/popup-images";

export class InvalidPopupImageContentError extends Error {
  constructor(message = "Uploaded file is not a supported image.") {
    super(message);
    this.name = "InvalidPopupImageContentError";
  }
}

function getPopupImageStorageRoot(): string {
  return resolveProductionAwareStorageRoot(
    process.env.POPUP_IMAGES_LOCAL_ROOT,
    DEFAULT_LOCAL_ROOT,
    PRODUCTION_LOCAL_ROOT
  );
}

/** Path-traversal guard, same shape as material-storage.local.ts / staff-photo-storage.ts. */
function resolvePopupImagePath(popupId: string): string {
  const clean = popupId.replace(/^\/+/, "");
  const normalized = path.normalize(clean);
  if (normalized.startsWith("..")) {
    throw new Error("Invalid popup id.");
  }
  return path.join(getPopupImageStorageRoot(), normalized, "image");
}

export function buildPopupImageUrl(popupId: string): string {
  return `/api/popups/${popupId}/image`;
}

/**
 * Validates the REAL content of an image buffer via magic bytes (sharp)
 * rather than trusting the client-supplied MIME type. Throws
 * `InvalidPopupImageContentError` when the detected format is absent or
 * outside the jpeg/png/gif/webp allowlist (SVG stays disallowed).
 */
async function assertValidPopupImageContent(buffer: Buffer): Promise<void> {
  let format: string | undefined;
  try {
    ({ format } = await sharp(buffer).metadata());
  } catch {
    throw new InvalidPopupImageContentError();
  }
  if (!format || !SHARP_FORMAT_TO_MIME[format]) {
    throw new InvalidPopupImageContentError();
  }
}

export async function storePopupImageFile(popupId: string, buffer: Buffer): Promise<void> {
  await assertValidPopupImageContent(buffer);
  const targetPath = resolvePopupImagePath(popupId);
  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, buffer);
  } catch (error) {
    rethrowAsStoragePermissionDeniedError(error, "popup image storage");
  }
}

export async function deletePopupImageFile(popupId: string): Promise<void> {
  try {
    await fs.rm(resolvePopupImagePath(popupId), { force: true });
  } catch (error) {
    rethrowAsStoragePermissionDeniedError(error, "popup image storage");
  }
}

/**
 * Reads a popup's stored image for the PUBLIC serving route, re-deriving the
 * MIME type from the bytes (sharp) rather than a stored column — see the
 * module comment above. Returns `null` for a missing popup id, a popup with
 * no uploaded image, or (defensively) a file on disk that no longer looks
 * like one of the allowed formats; the route turns `null` into a clean 404.
 */
export async function readPopupImageFile(popupId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(resolvePopupImagePath(popupId));
  } catch (error) {
    if (isFilesystemNotFoundError(error)) {
      return null;
    }
    rethrowAsStoragePermissionDeniedError(error, "popup image storage");
  }

  const { format } = await sharp(buffer)
    .metadata()
    .catch(() => ({ format: undefined }));
  const mimeType = format ? SHARP_FORMAT_TO_MIME[format] : undefined;
  return mimeType ? { buffer, mimeType } : null;
}
