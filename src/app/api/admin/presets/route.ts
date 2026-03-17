import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";

function isValidPresetDiscount(body: Record<string, unknown>): boolean {
  const kind = body.discountKind;
  const value = body.discountValue;

  if ((kind === undefined || kind === null) && (value === undefined || value === null)) {
    return true;
  }

  if ((kind !== "amount" && kind !== "percent") || typeof value !== "number" || !Number.isInteger(value)) {
    return false;
  }

  if (kind === "amount") {
    return value >= 0 && value <= 50_000_000;
  }

  return value >= 1 && value <= 10_000;
}

/**
 * Returns all active invoice product presets.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const presets = await prisma.invoiceProductPreset.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" }
    });

    return NextResponse.json({ ok: true, presets });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to fetch presets.");
  }
}

/**
 * Creates a new invoice product preset.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body.label !== "string" ||
      body.label.trim().length === 0 ||
      typeof body.unitPriceCents !== "number" ||
      (body.description !== undefined && typeof body.description !== "string") ||
      !isValidPresetDiscount(body as Record<string, unknown>)
    ) {
      return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
    }

    const preset = await prisma.invoiceProductPreset.create({
      data: {
        label: body.label,
        description: body.description || "",
        unitPriceCents: body.unitPriceCents,
        discountKind: body.discountKind ?? null,
        discountValue: body.discountValue ?? null,
        sortOrder: body.sortOrder || 0
      }
    });

    return NextResponse.json({ ok: true, preset });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to create preset.");
  }
}
