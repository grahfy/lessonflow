import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { ensureLocalOwnerAdminForE2E, getE2EAdminCredentials, isLocalPlaywrightBaseUrl } from "./e2e/helpers/admin-auth";

describe("admin-e2e-auth-helper", () => {
  beforeEach(async () => {
    await prisma.adminUser.deleteMany();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects local playwright base urls", () => {
    vi.stubEnv("PLAYWRIGHT_BASE_URL", "http://localhost:3000");
    expect(isLocalPlaywrightBaseUrl()).toBe(true);

    vi.stubEnv("PLAYWRIGHT_BASE_URL", "https://example.com");
    expect(isLocalPlaywrightBaseUrl()).toBe(false);
  });

  it("creates or updates the local owner admin with e2e credentials", async () => {
    vi.stubEnv("PLAYWRIGHT_BASE_URL", "http://localhost:3000");
    vi.stubEnv("DOCS_SCREENSHOTS_ADMIN_EMAIL", "owner-e2e@example.com");
    vi.stubEnv("DOCS_SCREENSHOTS_ADMIN_PASSWORD", "DocsDemoAdmin!23");

    await ensureLocalOwnerAdminForE2E();
    const credentials = getE2EAdminCredentials();
    const created = await prisma.adminUser.findUniqueOrThrow({
      where: { email: credentials.email },
    });

    expect(created.role).toBe("owner");
    expect(created.isActive).toBe(true);
    await expect(bcrypt.compare(credentials.password, created.passwordHash)).resolves.toBe(true);

    await prisma.adminUser.update({
      where: { id: created.id },
      data: {
        passwordHash: await bcrypt.hash("old-password", 12),
        role: "teacher",
        isActive: false,
      },
    });

    await ensureLocalOwnerAdminForE2E();
    const updated = await prisma.adminUser.findUniqueOrThrow({
      where: { email: credentials.email },
    });

    expect(updated.role).toBe("owner");
    expect(updated.isActive).toBe(true);
    await expect(bcrypt.compare(credentials.password, updated.passwordHash)).resolves.toBe(true);
  });
});
