import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/observability";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

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
