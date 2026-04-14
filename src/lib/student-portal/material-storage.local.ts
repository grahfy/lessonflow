/**
 * Local Filesystem Material Storage Driver
 * 
 * Implementation of the storage interface for single-instance VPS deployments.
 * 
 * SECURITY RATIONALE:
 * 1. Path Traversal Guard: We strictly normalize and bounds-check all file 
 *    paths using `path.normalize(clean)` to ensure malicious keys cannot 
 *    read/write outside the designated `.data/learning-materials` directory.
 * 2. Unreachable From Web Root: Local files are stored OUTSIDE the `public/` 
 *    folder. They can only be accessed via the authenticated API Route handler 
 *    which verifies session integrity before streaming the buffer.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { resolveConfiguredStorageRoot } from "@/lib/runtime-paths";
import { rethrowAsStoragePermissionDeniedError } from "@/lib/storage-errors";
import type {
  DeleteMaterialInput,
  GetMaterialInput,
  MaterialBlob,
  MaterialStorageDriver,
  PutMaterialInput
} from "@/lib/student-portal/material-storage";

const DEFAULT_LOCAL_ROOT = ".data/learning-materials";
const PRODUCTION_LOCAL_ROOT = "/var/www/lessonflow/data/learning-materials";

/**
 * Resolves the root directory used for local learning-material persistence.
 */
export function getLocalMaterialStorageRoot(): string {
  return process.env.NODE_ENV === "production"
    ? resolveConfiguredStorageRoot(
        process.env.LEARNING_MATERIALS_LOCAL_ROOT,
        DEFAULT_LOCAL_ROOT,
        PRODUCTION_LOCAL_ROOT
      )
    : resolveConfiguredStorageRoot(process.env.LEARNING_MATERIALS_LOCAL_ROOT, DEFAULT_LOCAL_ROOT);
}

/**
 * Guards against path traversal by forcing normalized relative keys.
 */
function resolveLocalPath(storageKey: string): string {
  const clean = storageKey.replace(/^\/+/, "");
  const normalized = path.normalize(clean);
  if (normalized.startsWith("..")) {
    throw new Error("Invalid storage key path.");
  }
  return path.join(getLocalMaterialStorageRoot(), normalized);
}

/**
 * Ensures the parent directory exists before writing a local object.
 */
async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

/**
 * Local filesystem implementation for material storage in dev/test contexts.
 */
export function createLocalMaterialStorageDriver(): MaterialStorageDriver {
  return {
    async put(input: PutMaterialInput): Promise<void> {
      try {
        const targetPath = resolveLocalPath(input.storageKey);
        await ensureParentDirectory(targetPath);
        await fs.writeFile(targetPath, input.buffer);
      } catch (error) {
        rethrowAsStoragePermissionDeniedError(error, "learning material storage");
      }
    },

    async get(input: GetMaterialInput): Promise<MaterialBlob> {
      try {
        const sourcePath = resolveLocalPath(input.storageKey);
        const buffer = await fs.readFile(sourcePath);
        return { buffer };
      } catch (error) {
        rethrowAsStoragePermissionDeniedError(error, "learning material storage");
      }
    },

    async delete(input: DeleteMaterialInput): Promise<void> {
      try {
        const targetPath = resolveLocalPath(input.storageKey);
        await fs.rm(targetPath, { force: true });
      } catch (error) {
        rethrowAsStoragePermissionDeniedError(error, "learning material storage");
      }
    }
  };
}
