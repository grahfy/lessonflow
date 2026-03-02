import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pagePath = searchParams.get("pagePath");
  const sectionKey = searchParams.get("sectionKey");

  if (pagePath && sectionKey) {
    const content = await prisma.publicPageContent.findUnique({
      where: {
        pagePath_sectionKey: {
          pagePath,
          sectionKey
        }
      }
    });
    return NextResponse.json({ ok: true, content });
  }

  const allContent = await prisma.publicPageContent.findMany();
  return NextResponse.json({ ok: true, content: allContent });
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { pagePath, sectionKey, content } = body;

    if (!pagePath || !sectionKey || !content) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const updated = await prisma.publicPageContent.upsert({
      where: {
        pagePath_sectionKey: {
          pagePath,
          sectionKey
        }
      },
      update: {
        content
      },
      create: {
        pagePath,
        sectionKey,
        content
      }
    });

    return NextResponse.json({ ok: true, content: updated });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to save content.");
  }
}
