import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { canManageStaffAccount } from "@/lib/admin/permissions";
import {
  buildStaffPhotoStorageKey,
  classifyStaffPhoto,
  deleteStaffPhoto,
  getStaffPhoto,
  putStaffPhoto
} from "@/lib/admin/staff-photo-storage";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const staff = await prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        isActive: true,
        profilePhotoStorageKey: true,
        profilePhotoMimeType: true
      }
    });
    if (!staff || !staff.profilePhotoStorageKey || !staff.profilePhotoMimeType) {
      return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
    }

    if (!staff.isActive && !canManageStaffAccount(admin, staff.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const blob = await getStaffPhoto(staff.profilePhotoStorageKey, staff.profilePhotoMimeType);
    return new NextResponse(new Uint8Array(blob.buffer), {
      headers: {
        "content-type": blob.mimeType,
        "cache-control": "private, max-age=300",
        "content-length": String(blob.buffer.length)
      }
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load profile photo.");
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!canManageStaffAccount(admin, id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const staff = await prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        profilePhotoStorageKey: true
      }
    });
    if (!staff) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Profile photo file is required." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_PHOTO_SIZE_BYTES) {
      return NextResponse.json({ error: "Profile photo must be between 1 byte and 5MB." }, { status: 400 });
    }

    const classification = classifyStaffPhoto(file);
    if (!classification) {
      return NextResponse.json({ error: "Profile photo must be JPEG, PNG, GIF, or WebP." }, { status: 400 });
    }

    const storageKey = buildStaffPhotoStorageKey(staff.id, classification.extension);
    const buffer = Buffer.from(await file.arrayBuffer());
    await putStaffPhoto(storageKey, buffer);

    try {
      const updated = await prisma.adminUser.update({
        where: { id },
        data: {
          profilePhotoStorageKey: storageKey,
          profilePhotoMimeType: classification.mimeType
        }
      });

      await deleteStaffPhoto(staff.profilePhotoStorageKey).catch(() => null);

      return NextResponse.json({
        profilePhotoUrl: updated.profilePhotoStorageKey ? `/api/admin/staff/${updated.id}/photo` : null
      });
    } catch (error) {
      await deleteStaffPhoto(storageKey).catch(() => null);
      return jsonUnexpectedError(error, "Unable to save profile photo.");
    }
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to upload profile photo.");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!canManageStaffAccount(admin, id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const staff = await prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        profilePhotoStorageKey: true
      }
    });
    if (!staff) {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }

    await prisma.adminUser.update({
      where: { id },
      data: {
        profilePhotoStorageKey: null,
        profilePhotoMimeType: null
      }
    });

    await deleteStaffPhoto(staff.profilePhotoStorageKey).catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to delete profile photo.");
  }
}
