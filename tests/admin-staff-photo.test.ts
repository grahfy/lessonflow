import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as uploadStaffPhoto } from "@/app/api/admin/staff/[id]/photo/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

describe("admin-staff-photo", () => {
  beforeEach(async () => {
    await prisma.adminUser.deleteMany();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns a sanitized storage error when the staff photo root is not writable", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mgs-staff-photo-eacces-root-"));
    await fs.chmod(tempRoot, 0o555);
    vi.stubEnv("ADMIN_STAFF_PHOTOS_LOCAL_ROOT", tempRoot);

    try {
      const admin = await ensureOwnerAdmin();
      const targetStaff = await prisma.adminUser.create({
        data: {
          email: "photo-target@example.com",
          role: "teacher",
          firstName: "Photo",
          lastName: "Target",
          displayName: "Photo Target",
          passwordHash: await bcrypt.hash("staff-password", 12),
          isActive: true
        }
      });
      const cookie = `${getSessionCookieName()}=${createSessionToken(admin.email)}`;

      const uploadForm = new FormData();
      uploadForm.set(
        "file",
        new File([Buffer.from("locked-photo")], "avatar.png", {
          type: "image/png"
        })
      );

      const uploadResponse = await uploadStaffPhoto(
        new NextRequest(`http://localhost/api/admin/staff/${targetStaff.id}/photo`, {
          method: "POST",
          body: uploadForm,
          headers: {
            cookie
          }
        }),
        {
          params: Promise.resolve({ id: targetStaff.id })
        }
      );

      expect(uploadResponse.status).toBe(503);
      const body = (await uploadResponse.json()) as { code?: string; error?: string };
      expect(body.code).toBe("STORAGE_PERMISSION_DENIED");
      expect(body.error).toContain("Storage is unavailable for staff profile photo storage");
      expect(JSON.stringify(body)).not.toContain("EACCES");
      expect(JSON.stringify(body)).not.toContain(tempRoot);
    } finally {
      await fs.chmod(tempRoot, 0o755).catch(() => null);
      vi.unstubAllEnvs();
    }
  });
});
