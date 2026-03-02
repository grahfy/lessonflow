import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const template = await prisma.invoiceTemplate.findFirst({
    where: { isDefault: true }
  });
  return NextResponse.json({ ok: true, template });
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { logoUrl, accentColor, footerText, headerInfo } = body;

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
