// @vitest-environment node

import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getLocalMaterialStorageRoot } from "@/lib/student-portal/material-storage.local";

/**
 * Regression coverage for the local learning-material storage root resolution.
 *
 * `getLocalMaterialStorageRoot()` previously called `resolveConfiguredStorageRoot`
 * and passed the production volume path into that function's `cwd` parameter, so
 * in production with no absolute override it produced a DOUBLED path
 * (".../data/learning-materials/.data/learning-materials") instead of the intended
 * shared volume root. It now uses `resolveProductionAwareStorageRoot` (matching the
 * staff-photo / email-signature storage modules).
 */
const PRODUCTION_LOCAL_ROOT = "/var/www/lessonflow/data/learning-materials";

describe("getLocalMaterialStorageRoot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to the shared production volume when no override is set in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LEARNING_MATERIALS_LOCAL_ROOT", "");

    const root = getLocalMaterialStorageRoot();

    expect(root).toBe(path.resolve(PRODUCTION_LOCAL_ROOT));
    // The pre-fix bug produced this doubled path — guard against regressing to it.
    expect(root).not.toBe(path.resolve(PRODUCTION_LOCAL_ROOT, ".data/learning-materials"));
    expect(root.endsWith(path.join("learning-materials", ".data", "learning-materials"))).toBe(false);
  });

  it("honors an absolute override in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LEARNING_MATERIALS_LOCAL_ROOT", "/mnt/blobs/materials");

    expect(getLocalMaterialStorageRoot()).toBe(path.resolve("/mnt/blobs/materials"));
  });

  it("resolves the default relative root against the app root outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LEARNING_MATERIALS_LOCAL_ROOT", "");

    const root = getLocalMaterialStorageRoot();

    expect(path.isAbsolute(root)).toBe(true);
    expect(root.endsWith(path.join(".data", "learning-materials"))).toBe(true);
    // Never the production volume when not in production.
    expect(root).not.toBe(path.resolve(PRODUCTION_LOCAL_ROOT));
  });

  it("honors a relative override against the app root outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LEARNING_MATERIALS_LOCAL_ROOT", "custom/uploads");

    const root = getLocalMaterialStorageRoot();

    expect(path.isAbsolute(root)).toBe(true);
    expect(root.endsWith(path.join("custom", "uploads"))).toBe(true);
  });
});
