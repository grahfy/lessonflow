import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOwnerAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";

const updateTemplateSchema = z.object({
  logoUrl: z.string().trim().max(500).optional().nullable(),
  accentColor: z.string().trim().max(30).optional().nullable(),
  footerText: z.string().trim().max(2000).optional().nullable(),
  headerInfo: z.string().trim().max(2000).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const template = await prisma.invoiceTemplate.findFirst({
      where: { isDefault: true }
    });
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to load invoice template.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid template data.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { logoUrl, accentColor, footerText, headerInfo } = parsed.data;

    const existing = await prisma.invoiceTemplate.findFirst({
      where: { isDefault: true }
    });

    const updated = await prisma.invoiceTemplate.upsert({
      where: { id: existing?.id || "default-invoice-template" },
      update: { logoUrl, accentColor, footerText, headerInfo },
      create: { id: "default-invoice-template", isDefault: true, logoUrl, accentColor, footerText, headerInfo }
    });

    return NextResponse.json({ ok: true, template: updated });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to save invoice template.");
  }
}
