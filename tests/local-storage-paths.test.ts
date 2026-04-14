import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { putStaffPhoto } from "@/lib/admin/staff-photo-storage";
import { putEmailSignatureLogo } from "@/lib/email/signature-storage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function createStandaloneRuntimeRoot(prefix: string) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const releaseDir = path.join(tempRoot, "releases", "20260410120000");
  const standaloneDir = path.join(releaseDir, ".next", "standalone");
  await fs.mkdir(standaloneDir, { recursive: true });
  return { releaseDir, standaloneDir };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("local upload storage roots", () => {
  it("stores staff photos under the app root instead of .next/standalone", async () => {
    const { releaseDir, standaloneDir } = await createStandaloneRuntimeRoot("mgs-staff-photo-root-");
    vi.spyOn(process, "cwd").mockReturnValue(standaloneDir);

    await putStaffPhoto("staff/admin-1/avatar.png", Buffer.from("staff-photo"));

    const expectedPath = path.join(releaseDir, ".data", "admin-staff-photos", "staff", "admin-1", "avatar.png");
    await expect(fs.readFile(expectedPath, "utf-8")).resolves.toBe("staff-photo");
    await expect(
      fs.access(path.join(standaloneDir, ".data", "admin-staff-photos", "staff", "admin-1", "avatar.png"))
    ).rejects.toThrow();
  });

  it("stores email signature logos under the app root instead of .next/standalone", async () => {
    const { releaseDir, standaloneDir } = await createStandaloneRuntimeRoot("mgs-email-signature-root-");
    vi.spyOn(process, "cwd").mockReturnValue(standaloneDir);

    await putEmailSignatureLogo("email-signature/logo.webp", Buffer.from("signature-logo"));

    const expectedPath = path.join(releaseDir, ".data", "email-signature-logo", "email-signature", "logo.webp");
    await expect(fs.readFile(expectedPath, "utf-8")).resolves.toBe("signature-logo");
    await expect(
      fs.access(path.join(standaloneDir, ".data", "email-signature-logo", "email-signature", "logo.webp"))
    ).rejects.toThrow();
  });

  it("stores admin asset roots on shared production paths when NODE_ENV is production", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mgs-admin-production-roots-"));
    const standaloneDir = path.join(tempRoot, "releases", "20260410120000", ".next", "standalone");
    const staffRoot = path.join(tempRoot, "shared", "admin-staff-photos");
    const emailRoot = path.join(tempRoot, "shared", "email-signature-logo");
    await fs.mkdir(standaloneDir, { recursive: true });

    vi.spyOn(process, "cwd").mockReturnValue(standaloneDir);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_STAFF_PHOTOS_LOCAL_ROOT", staffRoot);
    vi.stubEnv("EMAIL_SIGNATURE_LOGO_LOCAL_ROOT", emailRoot);

    try {
      await putStaffPhoto("staff/admin-1/avatar.png", Buffer.from("staff-photo-prod"));
      await putEmailSignatureLogo("email-signature/logo.webp", Buffer.from("signature-logo-prod"));

      await expect(fs.readFile(path.join(staffRoot, "staff", "admin-1", "avatar.png"), "utf-8")).resolves.toBe("staff-photo-prod");
      await expect(
        fs.readFile(path.join(emailRoot, "email-signature", "logo.webp"), "utf-8")
      ).resolves.toBe("signature-logo-prod");
      await expect(
        fs.access(path.join(standaloneDir, ".data", "admin-staff-photos", "staff", "admin-1", "avatar.png"))
      ).rejects.toThrow();
      await expect(
        fs.access(path.join(standaloneDir, ".data", "email-signature-logo", "email-signature", "logo.webp"))
      ).rejects.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
