import { NextRequest, NextResponse } from "next/server";

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
      }
    });
    if (!material) {
      return NextResponse.json({ error: "Learning material not found." }, { status: 404 });
    }

    const dispositionParam = request.nextUrl.searchParams.get("disposition");
    const disposition = dispositionParam === "inline" ? "inline" : "attachment";

    const storage = createMaterialStorageDriver();
    const blob = await storage.get({
      storageKey: material.storageKey
    });

    return new NextResponse(new Uint8Array(blob.buffer), {
      status: 200,
      headers: {
        "content-type": material.mimeType,
        "content-disposition": `${disposition}; filename="${buildLearningMaterialDownloadFilename({
          title: material.title,
          materialType: material.materialType,
          mimeType: material.mimeType
        })}"`,
        "x-content-type-options": "nosniff"
      }
    });
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
      }
    });
    if (!existing) {
      return NextResponse.json({ error: "Learning material not found." }, { status: 404 });
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
