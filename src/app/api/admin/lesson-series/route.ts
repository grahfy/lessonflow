import { NextRequest, NextResponse } from "next/server";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { requireAdminFromRequest } from "@/lib/admin-route";
import {
  createLessonSeries,
  listLessonSeries,
} from "@/lib/lesson-series";

/**
 * GET /api/admin/lesson-series
 * Lists lesson series, optionally filtered by customerId, teacherId, or status.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId") ?? undefined;
    const teacherId = url.searchParams.get("teacherId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;

    const series = await listLessonSeries({ customerId, teacherId, status });
    return NextResponse.json({ ok: true, series });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to list lesson series.");
  }
}

/**
 * POST /api/admin/lesson-series
 * Creates a new lesson series.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const series = await createLessonSeries(
      { id: admin.id, role: admin.role },
      body
    );

    return NextResponse.json({ ok: true, series }, { status: 201 });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to create lesson series.");
  }
}
