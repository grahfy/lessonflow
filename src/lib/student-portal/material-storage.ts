import { createLocalMaterialStorageDriver } from "@/lib/student-portal/material-storage.local";
import { createS3MaterialStorageDriver } from "@/lib/student-portal/material-storage.s3";

export type MaterialStorageDriverName = "local" | "s3";

export type PutMaterialInput = {
  storageKey: string;
  buffer: Buffer;
  mimeType: string;
};

export type GetMaterialInput = {
  storageKey: string;
};

export type DeleteMaterialInput = {
  storageKey: string;
};

export type MaterialBlob = {
  buffer: Buffer;
};

/**
 * Unified storage-driver interface used by learning-material APIs.
 */
export type MaterialStorageDriver = {
  put(input: PutMaterialInput): Promise<void>;
  get(input: GetMaterialInput): Promise<MaterialBlob>;
  delete(input: DeleteMaterialInput): Promise<void>;
};

/**
 * Resolves the configured storage driver name with local default for dev/test.
 */
export function getMaterialStorageDriverName(): MaterialStorageDriverName {
  const raw = (process.env.LEARNING_MATERIALS_STORAGE_DRIVER || "local").trim().toLowerCase();
  return raw === "s3" ? "s3" : "local";
}

/**
 * Creates the active learning-material storage driver instance.
 */
export function createMaterialStorageDriver(): MaterialStorageDriver {
  const driver = getMaterialStorageDriverName();
  if (driver === "s3") {
    return createS3MaterialStorageDriver();
  }
  return createLocalMaterialStorageDriver();
}

