import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getStaffPhoto, POST as uploadStaffPhoto } from "@/app/api/admin/staff/[id]/photo/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

// Minimal valid 1x1 PNG so real-content (magic-byte) validation passes and the
// test exercises the storage-permission path rather than upload-content rejection.
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
  0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82
]);

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
        new File([PNG_BYTES], "avatar.png", {
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

  it("returns not found when staff photo metadata points to a missing file", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mgs-staff-photo-missing-root-"));
    vi.stubEnv("ADMIN_STAFF_PHOTOS_LOCAL_ROOT", tempRoot);

    try {
      const admin = await ensureOwnerAdmin();
      const targetStaff = await prisma.adminUser.create({
        data: {
          email: "missing-photo-target@example.com",
          role: "teacher",
          firstName: "Missing",
          lastName: "Photo",
          displayName: "Missing Photo",
          passwordHash: await bcrypt.hash("staff-password", 12),
          isActive: true,
          profilePhotoStorageKey: "staff/missing/avatar.png",
          profilePhotoMimeType: "image/png"
        }
      });
      const cookie = `${getSessionCookieName()}=${createSessionToken(admin.email)}`;

      const response = await getStaffPhoto(
        new NextRequest(`http://localhost/api/admin/staff/${targetStaff.id}/photo`, {
          headers: {
            cookie
          }
        }),
        {
          params: Promise.resolve({ id: targetStaff.id })
        }
      );

      expect(response.status).toBe(404);
      const body = (await response.json()) as { error?: string };
      expect(body.error).toBe("Profile photo not found.");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
