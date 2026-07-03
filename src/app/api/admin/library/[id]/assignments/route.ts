import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canAssignLibraryItem } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { assignLibraryItem } from "@/lib/library/library-service";
import { logEvent } from "@/lib/observability";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const assignBodySchema = z.object({
  customerIds: z.array(z.string().trim().min(1)).min(1)
});

/**
 * Lists the customers a library item is currently assigned to (provenance
 * included). Gated by canAssignLibraryItem.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canAssignLibraryItem(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const item = await prisma.libraryItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Library item not found." }, { status: 404 });
    }

    const assignments = await prisma.libraryAssignment.findMany({
      where: { libraryItemId: item.id },
      include: {
        customer: {
          select: { id: true, fullName: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({
      assignments: assignments.map((assignment) => ({
        customerId: assignment.customerId,
        customerName: assignment.customer.fullName,
        assignedById: assignment.assignedById,
        createdAt: assignment.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load library item assignments.");
  }
}

/**
 * Assigns a library item to one or more students BY REFERENCE. Any admin may
 * assign to any student (canAssignLibraryItem — the deliberate scoping bypass).
 *
 * Deterministic per AC4: validate ALL customerIds up front — if any id is not an
 * existing non-archived customer, return 400 naming the offender(s) and create
 * NOTHING; otherwise createMany({ skipDuplicates }) so re-assigning an already
 * assigned student is idempotent.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canAssignLibraryItem(admin)) {
      logEvent("library.assignment_denied", { adminId: admin.id, role: admin.role });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const item = await prisma.libraryItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Library item not found." }, { status: 404 });
    }

    const parsed = assignBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid assignment.", details: parsed.error.flatten() }, { status: 400 });
    }

    // De-duplicate the request ids before validating so the offender report and
    // the createMany input are both clean.
    const customerIds = Array.from(new Set(parsed.data.customerIds));

    // Validate ALL ids up front (AC4): every id must be an existing non-archived
    // customer, else 400 naming the offenders and create nothing.
    const existing = await prisma.customer.findMany({
      where: { id: { in: customerIds }, isArchived: false },
      select: { id: true }
    });
    const validIds = new Set(existing.map((customer) => customer.id));
    const invalidIds = customerIds.filter((customerId) => !validIds.has(customerId));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          error: `Unknown or archived customer id(s): ${invalidIds.join(", ")}`,
          invalidCustomerIds: invalidIds
        },
        { status: 400 }
      );
    }

    const created = await assignLibraryItem({
      libraryItemId: item.id,
      customerIds,
      assignedById: admin.id
    });

    return NextResponse.json({ ok: true, created }, { status: 201 });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to assign library item.");
  }
}
