import { NextRequest, NextResponse } from "next/server";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { logEvent } from "@/lib/observability";

type Params = {
  params: Promise<{ id: string }>;
};

/**
 * Lists every lesson-credit batch for a customer (including expired/depleted
 * ones) so the admin profile can show full credit history.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const now = new Date();
    const batches = await prisma.lessonCreditBatch.findMany({
      where: { customerId: id },
      orderBy: [{ createdAt: "desc" }],
      include: {
        package: { select: { id: true, label: true } }
      }
    });

    const totalRemaining = batches.reduce((sum, batch) => {
      const usable = batch.remainingQuantity > 0 && (!batch.expiresAt || batch.expiresAt > now);
      return usable ? sum + batch.remainingQuantity : sum;
    }, 0);

    return NextResponse.json({
      totalRemaining,
      batches: batches.map((batch) => ({
        id: batch.id,
        durationMinutes: batch.durationMinutes,
        initialQuantity: batch.initialQuantity,
        remainingQuantity: batch.remainingQuantity,
        source: batch.source,
        packageLabel: batch.package?.label ?? null,
        note: batch.note,
        expiresAt: batch.expiresAt ? batch.expiresAt.toISOString() : null,
        isExpired: batch.expiresAt ? batch.expiresAt <= now : false,
        createdAt: batch.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to load lesson credits.");
  }
}

/**
 * Grants a lesson-credit batch to a customer. The admin may pick a package
 * (which supplies count/duration/validity) OR specify a custom count, optional
 * duration, and optional expiry. Owner-gated.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true, isArchived: true } });
    if (!customer || customer.isArchived) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Missing payload." }, { status: 400 });
    }

    const packageId = typeof body.packageId === "string" && body.packageId.trim() ? body.packageId.trim() : null;

    let quantity: number;
    let durationMinutes: number | null;
    let expiresAt: Date | null;

    if (packageId) {
      const pkg = await prisma.lessonPackage.findUnique({
        where: { id: packageId },
        select: { id: true, lessonCount: true, durationMinutes: true, validityDays: true }
      });
      if (!pkg) {
        return NextResponse.json({ error: "Package not found." }, { status: 400 });
      }
      quantity = pkg.lessonCount;
      durationMinutes = pkg.durationMinutes;
      expiresAt = pkg.validityDays && pkg.validityDays > 0
        ? new Date(Date.now() + pkg.validityDays * 24 * 60 * 60 * 1000)
        : null;
    } else {
      // Custom grant: validate count, optional duration, optional expiry.
      if (typeof body.lessonCount !== "number" || !Number.isInteger(body.lessonCount) || body.lessonCount < 1 || body.lessonCount > 1000) {
        return NextResponse.json({ error: "Lesson count must be a whole number between 1 and 1000." }, { status: 400 });
      }
      quantity = body.lessonCount;

      if (body.durationMinutes === undefined || body.durationMinutes === null || body.durationMinutes === "") {
        durationMinutes = null;
      } else if (typeof body.durationMinutes === "number" && Number.isInteger(body.durationMinutes) && body.durationMinutes >= 1 && body.durationMinutes <= 600) {
        durationMinutes = body.durationMinutes;
      } else {
        return NextResponse.json({ error: "Duration is invalid." }, { status: 400 });
      }

      if (body.expiresAt === undefined || body.expiresAt === null || body.expiresAt === "") {
        expiresAt = null;
      } else {
        const parsedDate = new Date(body.expiresAt);
        if (Number.isNaN(parsedDate.getTime())) {
          return NextResponse.json({ error: "Expiry date is invalid." }, { status: 400 });
        }
        expiresAt = parsedDate;
      }
    }

    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

    const batch = await prisma.lessonCreditBatch.create({
      data: {
        customerId: id,
        durationMinutes,
        initialQuantity: quantity,
        remainingQuantity: quantity,
        // Always admin_grant: package_purchase is reserved for credits granted by
        // a paid package invoice (idempotency keys on sourceInvoiceId there).
        source: "admin_grant",
        packageId,
        note,
        expiresAt,
        createdById: admin.id
      }
    });

    logEvent("lesson_credits.admin_granted", {
      customerId: id,
      batchId: batch.id,
      quantity,
      durationMinutes,
      via: packageId ? "package" : "custom",
      actorId: admin.id
    });

    return NextResponse.json({ ok: true, batch: { id: batch.id } }, { status: 201 });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to grant lesson credits.");
  }
}
