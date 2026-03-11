import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";

type EmailTemplateInput = {
  templateKey: string;
  subject: string;
  htmlBody: string;
};

function isEmailTemplateInput(value: unknown): value is EmailTemplateInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<EmailTemplateInput>;
  return (
    typeof candidate.templateKey === "string" &&
    candidate.templateKey.trim().length > 0 &&
    typeof candidate.subject === "string" &&
    candidate.subject.trim().length > 0 &&
    typeof candidate.htmlBody === "string" &&
    candidate.htmlBody.trim().length > 0
  );
}

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
    const templates = Array.isArray(body?.templates)
      ? body.templates
      : [body];

    if (templates.length === 0 || !templates.every(isEmailTemplateInput)) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const updated = await prisma.$transaction(
      templates.map((template: EmailTemplateInput) =>
        prisma.emailTemplate.upsert({
          where: { templateKey: template.templateKey },
          update: { subject: template.subject, htmlBody: template.htmlBody },
          create: {
            templateKey: template.templateKey,
            subject: template.subject,
            htmlBody: template.htmlBody
          }
        })
      )
    );

    return NextResponse.json({
      ok: true,
      templates: updated,
      savedCount: updated.length
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to save email template.");
  }
}
