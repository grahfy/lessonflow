import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type StoredEmailSignatureLogo = {
  buffer: Buffer;
  mimeType: string;
};

const DEFAULT_LOCAL_ROOT = path.resolve(process.cwd(), ".data/email-signature-logo");
const ALLOWED_IMAGE_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"]
]);

function getStorageRoot(): string {
  return DEFAULT_LOCAL_ROOT;
}

function resolveLocalPath(storageKey: string): string {
  const clean = storageKey.replace(/^\/+/, "");
  const normalized = path.normalize(clean);
  if (normalized.startsWith("..")) {
    throw new Error("Invalid email signature logo storage key.");
  }

  return path.join(getStorageRoot(), normalized);
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function classifyEmailSignatureLogo(file: File): { mimeType: string; extension: string } | null {
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

export function buildEmailSignatureLogoStorageKey(extension: string): string {
  return `email-signature/${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

export async function putEmailSignatureLogo(storageKey: string, buffer: Buffer): Promise<void> {
  const targetPath = resolveLocalPath(storageKey);
  await ensureParentDirectory(targetPath);
  await fs.writeFile(targetPath, buffer);
}

export async function getEmailSignatureLogo(storageKey: string, mimeType: string): Promise<StoredEmailSignatureLogo> {
  const sourcePath = resolveLocalPath(storageKey);
  return {
    buffer: await fs.readFile(sourcePath),
    mimeType
  };
}

export async function deleteEmailSignatureLogo(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) {
    return;
  }

  await fs.rm(resolveLocalPath(storageKey), { force: true });
}
