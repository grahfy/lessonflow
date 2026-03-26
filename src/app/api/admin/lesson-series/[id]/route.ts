import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import {
  archiveLessonSeries,
  updateLessonSeries,
} from "@/lib/lesson-series";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/lesson-series/[id]
 * Updates a lesson series.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const series = await updateLessonSeries(
      { id: admin.id, role: admin.role },
      id,
      body
    );

    return NextResponse.json({ ok: true, series });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to update lesson series.");
  }
}

/**
 * DELETE /api/admin/lesson-series/[id]
 * Archives a lesson series.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await archiveLessonSeries(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to archive lesson series.");
  }
}
