import path from "node:path";
import { describe, expect, it } from "vitest";

import { isRelativeConfiguredPath, resolveConfiguredStorageRoot, resolveRuntimeAppRoot } from "@/lib/runtime-paths";

describe("runtime-paths", () => {
  it("leaves a normal app cwd unchanged", () => {
    expect(resolveRuntimeAppRoot("/srv/mgs/current")).toBe(path.resolve("/srv/mgs/current"));
  });

  it("resolves standalone cwd values back to the app root", () => {
    expect(resolveRuntimeAppRoot("/srv/mgs/current/.next/standalone")).toBe(path.resolve("/srv/mgs/current"));
  });

  it("resolves relative storage roots from the runtime app root", () => {
    const resolved = resolveConfiguredStorageRoot(
      ".data/learning-materials",
      ".data/learning-materials",
      "/srv/mgs/current/.next/standalone"
    );

    expect(resolved).toBe(path.resolve("/srv/mgs/current/.data/learning-materials"));
  });

  it("preserves absolute configured storage roots", () => {
    const resolved = resolveConfiguredStorageRoot(
      "/var/www/lessonflow/data/learning-materials",
      ".data/learning-materials",
      "/srv/mgs/current/.next/standalone"
    );

    expect(resolved).toBe(path.resolve("/var/www/lessonflow/data/learning-materials"));
  });

  it("detects whether a configured storage root is relative", () => {
    expect(isRelativeConfiguredPath(".data/learning-materials")).toBe(true);
    expect(isRelativeConfiguredPath("/var/www/lessonflow/data/learning-materials")).toBe(false);
    expect(isRelativeConfiguredPath("")).toBe(false);
  });
});
