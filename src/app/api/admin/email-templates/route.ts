import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const templates = await prisma.emailTemplate.findMany();
  return NextResponse.json({ ok: true, templates });
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { templateKey, subject, htmlBody } = body;

    if (!templateKey || !subject || !htmlBody) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const updated = await prisma.emailTemplate.upsert({
      where: { templateKey },
      update: { subject, htmlBody },
      create: { templateKey, subject, htmlBody }
    });

    return NextResponse.json({ ok: true, template: updated });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to save email template.");
  }
}
