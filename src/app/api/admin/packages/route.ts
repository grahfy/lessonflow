import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";

/**
 * Validates the optional integer fields shared by package create/update.
 * Returns an error string when invalid, or null when the payload is acceptable.
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
 * Returns all active lesson packages, ordered for display.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const packages = await prisma.lessonPackage.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });

    return NextResponse.json({ ok: true, packages });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to fetch packages.");
  }
}

/**
 * Creates a new lesson package.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Missing payload." }, { status: 400 });
    }
    const validationError = validatePackageBody(body as Record<string, unknown>);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const pkg = await prisma.lessonPackage.create({
      data: {
        label: body.label.trim(),
        description: body.description ?? null,
        lessonCount: body.lessonCount,
        durationMinutes: body.durationMinutes ?? null,
        priceCents: body.priceCents,
        validityDays: body.validityDays ?? null,
        sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0
      }
    });

    return NextResponse.json({ ok: true, package: pkg });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to create package.");
  }
}
