import { exec } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAdminBuildInfo, resetAdminBuildInfoCache } from "@/lib/build-info";

vi.mock("node:child_process", () => ({
  exec: vi.fn()
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => fn)
}));

describe("build-info", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAdminBuildInfoCache();
  });

  it("prefers release tag plus short commit when git metadata is available", async () => {
    (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string) => {
      if (command.includes("describe --tags --abbrev=0")) {
        return Promise.resolve({ stdout: "v1.0\n" });
      }

      if (command.includes("rev-parse --short HEAD")) {
        return Promise.resolve({ stdout: "d338e15\n" });
      }

      if (command.includes("describe --tags --always")) {
        return Promise.resolve({ stdout: "v1.0-1-gd338e15\n" });
      }

      return Promise.resolve({ stdout: "" });
    });

    const buildInfo = await getAdminBuildInfo();

    expect(buildInfo.versionText).toBe("v1.0 · d338e15");
    expect(buildInfo.releaseLabel).toBe("v1.0");
    expect(buildInfo.shortCommit).toBe("d338e15");
    expect(buildInfo.source).toBe("git");
    expect(buildInfo.createdBy).toBe("Dean Thomson");
  });

  it("falls back to commit-only display when no tag is available", async () => {
    (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation((command: string) => {
      if (command.includes("describe --tags --abbrev=0")) {
        return Promise.reject(new Error("no tag"));
      }

      if (command.includes("rev-parse --short HEAD")) {
        return Promise.resolve({ stdout: "abc1234\n" });
      }

      if (command.includes("describe --tags --always")) {
        return Promise.resolve({ stdout: "abc1234\n" });
      }

      return Promise.resolve({ stdout: "" });
    });

    const buildInfo = await getAdminBuildInfo();

    expect(buildInfo.versionText).toBe("abc1234");
    expect(buildInfo.shortCommit).toBe("abc1234");
    expect(buildInfo.source).toBe("git");
  });

  it("falls back to package.json when git commands are unavailable", async () => {
    (exec as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("git unavailable"));

    const buildInfo = await getAdminBuildInfo();

    expect(buildInfo.versionText).toBe("0.1.0");
    expect(buildInfo.releaseLabel).toBe("0.1.0");
    expect(buildInfo.shortCommit).toBe("unavailable");
    expect(buildInfo.source).toBe("package");
  });
});
