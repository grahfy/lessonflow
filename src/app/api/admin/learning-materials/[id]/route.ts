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
