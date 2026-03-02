import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";

type Context = {
  params: Promise<{ id: string }>;
};

/**
 * Updates an existing invoice product preset.
 */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Missing payload." }, { status: 400 });
    }

    const preset = await prisma.invoiceProductPreset.update({
      where: { id },
      data: {
        label: body.label,
        description: body.description,
        unitPriceCents: body.unitPriceCents,
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
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
