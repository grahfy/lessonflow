import fs from "node:fs/promises";
import path from "node:path";

import type {
  DeleteMaterialInput,
  GetMaterialInput,
  MaterialBlob,
  MaterialStorageDriver,
  PutMaterialInput
} from "@/lib/student-portal/material-storage";

const DEFAULT_LOCAL_ROOT = path.resolve(process.cwd(), ".data/learning-materials");

/**
 * Resolves the root directory used for local learning-material persistence.
 */
function getLocalStorageRoot(): string {
  const configured = process.env.LEARNING_MATERIALS_LOCAL_ROOT?.trim();
  if (!configured) {
    return DEFAULT_LOCAL_ROOT;
  }
  return path.resolve(configured);
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
  return path.join(getLocalStorageRoot(), normalized);
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
      const targetPath = resolveLocalPath(input.storageKey);
      await ensureParentDirectory(targetPath);
      await fs.writeFile(targetPath, input.buffer);
    },

    async get(input: GetMaterialInput): Promise<MaterialBlob> {
      const sourcePath = resolveLocalPath(input.storageKey);
      const buffer = await fs.readFile(sourcePath);
      return { buffer };
    },

    async delete(input: DeleteMaterialInput): Promise<void> {
      const targetPath = resolveLocalPath(input.storageKey);
      await fs.rm(targetPath, { force: true });
    }
  };
}
