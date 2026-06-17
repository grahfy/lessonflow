import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";

/** True when a Prisma update/delete failed because the row id does not exist. */
function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

type Context = {
  params: Promise<{ id: string }>;
};

/**
 * Validates the optional integer fields shared by package create/update.
 */
function validatePackageBody(body: Record<string, unknown>): string | null {
  if (typeof body.label !== "string" || body.label.trim().length === 0) {
    return "Label is required.";
  }
  if (typeof body.lessonCount !== "number" || !Number.isInteger(body.lessonCount) || body.lessonCount < 1 || body.lessonCount > 1000) {
    return "Lesson count must be a whole number between 1 and 1000.";
  }
  if (typeof body.priceCents !== "number" || !Number.isInteger(body.priceCents) || body.priceCents < 0 || body.priceCents > 50_000_000) {
    return "Price is invalid.";
  }
  if (
    body.durationMinutes !== undefined &&
    body.durationMinutes !== null &&
    (typeof body.durationMinutes !== "number" || !Number.isInteger(body.durationMinutes) || body.durationMinutes < 1 || body.durationMinutes > 600)
  ) {
    return "Duration is invalid.";
  }
  if (
    body.validityDays !== undefined &&
    body.validityDays !== null &&
    (typeof body.validityDays !== "number" || !Number.isInteger(body.validityDays) || body.validityDays < 1 || body.validityDays > 3650)
  ) {
    return "Validity days is invalid.";
  }
  if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
    return "Description is invalid.";
  }
  return null;
}

/**
 * Updates an existing lesson package.
 */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Missing payload." }, { status: 400 });
    }
    const validationError = validatePackageBody(body as Record<string, unknown>);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const pkg = await prisma.lessonPackage.update({
      where: { id },
      data: {
        label: body.label.trim(),
        description: body.description ?? null,
        lessonCount: body.lessonCount,
        durationMinutes: body.durationMinutes ?? null,
        priceCents: body.priceCents,
        validityDays: body.validityDays ?? null,
        sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
        ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {})
      }
    });

    return NextResponse.json({ ok: true, package: pkg });
  } catch (error) {
    if (isRecordNotFound(error)) {
      return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
    }
    return jsonUnexpectedError(error, "Failed to update package.");
  }
}

/**
 * Soft-deletes a lesson package by marking it inactive. Existing credit batches
 * granted from it are preserved (the packageId FK is SET NULL on delete, but we
 * never hard-delete so historical provenance remains intact).
 */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await prisma.lessonPackage.update({
      where: { id },
      data: { isActive: false }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isRecordNotFound(error)) {
      return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
    }
    return jsonUnexpectedError(error, "Failed to delete package.");
  }
}
