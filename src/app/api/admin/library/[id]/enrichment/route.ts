import { NextRequest, NextResponse } from "next/server";

import { canManageLibrary } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

/** Returns compact confirmation data plus full provenance for the Review tags affordance. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageLibrary(admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const runs = await prisma.libraryEnrichmentRun.findMany({
      where: { libraryItemId: id }, orderBy: { createdAt: "desc" }, take: 1,
      include: { findings: { orderBy: { createdAt: "asc" } } }
    });
    const run = runs[0] ?? null;
    return NextResponse.json({ run: run && { id: run.id, status: run.status, findings: run.findings } });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load tag enrichment.");
  }
}
