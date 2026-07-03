import { NextRequest, NextResponse } from "next/server";

import { canAssignLibraryItem } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { unassignLibraryItem } from "@/lib/library/library-service";

type Params = {
  params: Promise<{
    id: string;
    customerId: string;
  }>;
};

/**
 * Unassigns a library item from a single student (removes the by-reference join
 * row only). NEVER deletes the master blob and never affects other assignees
 * (AC9). Idempotent. Gated by canAssignLibraryItem.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canAssignLibraryItem(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, customerId } = await params;
    const item = await prisma.libraryItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Library item not found." }, { status: 404 });
    }

    const removed = await unassignLibraryItem({ libraryItemId: item.id, customerId });

    return NextResponse.json({ ok: true, removed });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to unassign library item.");
  }
}
