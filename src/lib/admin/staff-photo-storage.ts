import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { resolveProductionAwareStorageRoot } from "@/lib/runtime-paths";
import { rethrowAsStoragePermissionDeniedError } from "@/lib/storage-errors";

type StoredStaffPhoto = {
  buffer: Buffer;
  mimeType: string;
};

const DEFAULT_LOCAL_ROOT = ".data/admin-staff-photos";
const PRODUCTION_LOCAL_ROOT = "/var/www/lessonflow/data/admin-staff-photos";
const ALLOWED_IMAGE_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"]
]);

function getStorageRoot(): string {
  return resolveProductionAwareStorageRoot(
    process.env.ADMIN_STAFF_PHOTOS_LOCAL_ROOT,
    DEFAULT_LOCAL_ROOT,
    PRODUCTION_LOCAL_ROOT
  );
}

/**
 * Resolves the storage root used for admin profile photos.
 */
export function getStaffPhotoStorageRoot(): string {
  return getStorageRoot();
}

function resolveLocalPath(storageKey: string): string {
  const clean = storageKey.replace(/^\/+/, "");
  const normalized = path.normalize(clean);
  if (normalized.startsWith("..")) {
    throw new Error("Invalid profile photo storage key.");
  }
  return path.join(getStorageRoot(), normalized);
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function classifyStaffPhoto(file: File): { mimeType: string; extension: string } | null {
  const mimeType = file.type.trim().toLowerCase();
  const extension = ALLOWED_IMAGE_TYPES.get(mimeType);
  if (!extension) {
    return null;
  }
  return {
    mimeType,
    extension
  };
}

export function buildStaffPhotoStorageKey(staffId: string, extension: string): string {
  return `staff/${staffId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

export async function putStaffPhoto(storageKey: string, buffer: Buffer): Promise<void> {
  try {
    const targetPath = resolveLocalPath(storageKey);
    await ensureParentDirectory(targetPath);
    await fs.writeFile(targetPath, buffer);
  } catch (error) {
    rethrowAsStoragePermissionDeniedError(error, "staff profile photo storage");
  }
}

export async function getStaffPhoto(storageKey: string, mimeType: string): Promise<StoredStaffPhoto> {
  try {
    const sourcePath = resolveLocalPath(storageKey);
    return {
      buffer: await fs.readFile(sourcePath),
      mimeType
    };
  } catch (error) {
    rethrowAsStoragePermissionDeniedError(error, "staff profile photo storage");
  }
}

export async function deleteStaffPhoto(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) {
    return;
  }
  try {
    await fs.rm(resolveLocalPath(storageKey), { force: true });
  } catch (error) {
    rethrowAsStoragePermissionDeniedError(error, "staff profile photo storage");
  }
}
