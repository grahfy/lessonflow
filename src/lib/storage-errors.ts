import { AppError } from "@/lib/errors";

const PERMISSION_DENIED_CODES = new Set(["EACCES", "EPERM"]);
const NOT_FOUND_CODES = new Set(["ENOENT"]);

export const STORAGE_PERMISSION_DENIED_CODE = "STORAGE_PERMISSION_DENIED";

/**
 * Application error used when the filesystem denies access to an admin storage root.
 */
export class StoragePermissionDeniedError extends AppError {
  constructor(resource: string) {
    super(`Storage is unavailable for ${resource}. Check filesystem permissions.`, STORAGE_PERMISSION_DENIED_CODE, 503);
    this.name = "StoragePermissionDeniedError";
  }
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Returns true when a filesystem call failed due to permissions.
 */
export function isFilesystemPermissionDeniedError(error: unknown): boolean {
  const code = getErrorCode(error);
  return Boolean(code && PERMISSION_DENIED_CODES.has(code));
}

/**
 * Returns true when a filesystem call failed because the backing object is gone.
 */
export function isFilesystemNotFoundError(error: unknown): boolean {
  const code = getErrorCode(error);
  return Boolean(code && NOT_FOUND_CODES.has(code));
}

/**
 * Re-throws permission failures as a sanitized app error while preserving all
 * other failure modes for normal error handling.
 */
export function rethrowAsStoragePermissionDeniedError(error: unknown, resource: string): never {
  if (isFilesystemPermissionDeniedError(error)) {
    throw new StoragePermissionDeniedError(resource);
  }

  throw error;
}
