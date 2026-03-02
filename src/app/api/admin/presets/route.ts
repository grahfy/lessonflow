import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";

/**
 * Returns all active invoice product presets.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.label || !body.description || typeof body.unitPriceCents !== "number") {
      return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
    }

    const preset = await prisma.invoiceProductPreset.create({
      data: {
        label: body.label,
        description: body.description,
        unitPriceCents: body.unitPriceCents,
        sortOrder: body.sortOrder || 0
      }
    });

    return NextResponse.json({ ok: true, preset });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to create preset.");
  }
}
