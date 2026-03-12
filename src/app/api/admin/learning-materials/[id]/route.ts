import { NextRequest, NextResponse } from "next/server";

import { canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/observability";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { buildLearningMaterialDownloadFilename } from "@/lib/student-portal/materials";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function buildMaterialResponse(buffer: Buffer, mimeType: string, disposition: string, filename: string, rangeHeader: string | null) {
  const total = buffer.length;
  const baseHeaders: Record<string, string> = {
    "content-type": mimeType,
    "content-disposition": `${disposition}; filename="${filename}"`,
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes"
  };

  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) {
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...baseHeaders,
        "content-length": String(total)
      }
    });
  }

  const [startRaw, endRaw] = rangeHeader.replace(/^bytes=/, "").split("-", 2);
  let start = startRaw ? Number.parseInt(startRaw, 10) : NaN;
  let end = endRaw ? Number.parseInt(endRaw, 10) : NaN;

  if (Number.isNaN(start) && !Number.isNaN(end)) {
    const suffixLength = Math.max(0, end);
    start = Math.max(0, total - suffixLength);
    end = total - 1;
  } else {
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end)) end = total - 1;
  }

  if (start < 0 || end < start || start >= total) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        "content-range": `bytes */${total}`
      }
    });
  }

  end = Math.min(end, total - 1);
  const chunk = buffer.subarray(start, end + 1);
  return new NextResponse(new Uint8Array(chunk), {
    status: 206,
    headers: {
      ...baseHeaders,
      "content-length": String(chunk.length),
      "content-range": `bytes ${start}-${end}/${total}`
    }
  });
}

/**
 * Streams one learning material file for admin preview/download.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const material = await prisma.learningMaterial.findUnique({
      where: {
        id
      },
      include: {
        customer: {
          select: {
            primaryTeacherId: true
          }
        }
      }
    });
    if (!material) {
      return NextResponse.json({ error: "Learning material not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, material.customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const dispositionParam = request.nextUrl.searchParams.get("disposition");
    const disposition = dispositionParam === "inline" ? "inline" : "attachment";

    const storage = createMaterialStorageDriver();
    const blob = await storage.get({
      storageKey: material.storageKey
    });

    return buildMaterialResponse(
      blob.buffer,
      material.mimeType,
      disposition,
      buildLearningMaterialDownloadFilename({
        title: material.title,
        materialType: material.materialType,
        mimeType: material.mimeType
      }),
      request.headers.get("range")
    );
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load learning material.");
  }
}

/**
 * Deletes one learning material metadata row and attempts storage cleanup.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.learningMaterial.findUnique({
      where: {
        id
      },
      include: {
        customer: {
          select: {
            primaryTeacherId: true
          }
        }
      }
    });
    if (!existing) {
      return NextResponse.json({ error: "Learning material not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, existing.customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete DB metadata first so the admin UI reflects removal immediately even if storage cleanup
    // later fails (cleanup errors are logged for follow-up).
    await prisma.learningMaterial.delete({
      where: {
        id
      }
    });

    const storage = createMaterialStorageDriver();
    await storage
      .delete({
        storageKey: existing.storageKey
      })
      .catch((error) => {
        // Storage cleanup is best-effort because the primary user-visible action (metadata removal)
        // has already succeeded.
        logError("learning_material.storage_delete_failed", error, {
          id: existing.id,
          storageKey: existing.storageKey
        });
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to delete learning material.");
  }
}
