import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireOwnerFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";

type ContentEntryInput = {
  pagePath: string;
  sectionKey: string;
  content: Prisma.InputJsonValue | typeof Prisma.JsonNull;
};

/** Guards the admin content upsert route against malformed entry payloads. */
function isContentEntry(value: unknown): value is ContentEntryInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ContentEntryInput>;
  return (
    typeof candidate.pagePath === "string" &&
    candidate.pagePath.trim().length > 0 &&
    typeof candidate.sectionKey === "string" &&
    candidate.sectionKey.trim().length > 0 &&
    candidate.content !== undefined
  );
}

/** Returns either one content block or the full public-content collection. */
export async function GET(request: NextRequest) {
  const admin = await requireOwnerFromRequest(request);
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
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

/**
 * Upserts one or many public content blocks from the admin editor.
 *
 * RATIONALE: The endpoint accepts either a single entry or an `entries[]` array
 * so both targeted saves and bulk editor submissions can share one contract.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireOwnerFromRequest(request);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const entries = (Array.isArray(body?.entries) ? body.entries : [body]) as unknown[];

    if (entries.length === 0 || !entries.every(isContentEntry)) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const updated = await prisma.$transaction(
      // NOTE: Upserting inside one transaction keeps the editor's bulk-save
      // semantics atomic from the admin's perspective.
      entries.map((entry: ContentEntryInput) =>
        prisma.publicPageContent.upsert({
          where: {
            pagePath_sectionKey: {
              pagePath: entry.pagePath,
              sectionKey: entry.sectionKey
            }
          },
          update: {
            content: entry.content
          },
          create: {
            pagePath: entry.pagePath,
            sectionKey: entry.sectionKey,
            content: entry.content
          }
        })
      )
    );

    return NextResponse.json({
      ok: true,
      content: updated,
      savedCount: updated.length
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Failed to save content.");
  }
}
