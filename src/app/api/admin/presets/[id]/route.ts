import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";

type Context = {
  params: Promise<{ id: string }>;
};

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
 * Updates an existing invoice product preset.
 */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || !isValidPresetDiscount(body as Record<string, unknown>)) {
      return NextResponse.json({ ok: false, error: "Missing payload." }, { status: 400 });
    }

    const preset = await prisma.invoiceProductPreset.update({
      where: { id },
      data: {
        label: body.label,
        description: body.description,
        unitPriceCents: body.unitPriceCents,
        discountKind: body.discountKind ?? null,
        discountValue: body.discountValue ?? null,
        sortOrder: body.sortOrder,
        isActive: body.isActive
      }
    });

    return NextResponse.json({ ok: true, preset });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to update preset.");
  }
}

/**
 * Soft-deletes an invoice product preset by marking it inactive.
 */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    
    // We soft-delete by default to keep DB records stable, but the UI will filter them out.
    await prisma.invoiceProductPreset.update({
      where: { id },
      data: { isActive: false }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to delete preset.");
  }
}
