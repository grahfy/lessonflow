import { describe, expect, it } from "vitest";

import {
  STORAGE_PERMISSION_DENIED_CODE,
  StoragePermissionDeniedError,
  isFilesystemNotFoundError,
  isFilesystemPermissionDeniedError,
  rethrowAsStoragePermissionDeniedError
} from "@/lib/storage-errors";

describe("storage-errors", () => {
  it("detects filesystem permission errors", () => {
    expect(isFilesystemPermissionDeniedError({ code: "EACCES" })).toBe(true);
    expect(isFilesystemPermissionDeniedError({ code: "EPERM" })).toBe(true);
    expect(isFilesystemPermissionDeniedError({ code: "ENOENT" })).toBe(false);
  });

  it("detects filesystem not-found errors", () => {
    expect(isFilesystemNotFoundError({ code: "ENOENT" })).toBe(true);
    expect(isFilesystemNotFoundError({ code: "EACCES" })).toBe(false);
  });

  it("wraps permission failures in a sanitized app error", () => {
    try {
      rethrowAsStoragePermissionDeniedError({ code: "EACCES" }, "learning material storage");
      throw new Error("Expected rethrow");
    } catch (error) {
      expect(error).toBeInstanceOf(StoragePermissionDeniedError);
      expect(error).toMatchObject({
        code: STORAGE_PERMISSION_DENIED_CODE,
        status: 503
      });
    }
  });
});
