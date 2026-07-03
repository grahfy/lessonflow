import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageLibrary } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const tagBodySchema = z.object({
  category: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(200)
});

/**
 * Lists the typed tags currently attached to a library item.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const item = await prisma.libraryItem.findUnique({
      where: { id },
      include: {
        tags: {
          include: { tag: true }
        }
      }
    });
    if (!item) {
      return NextResponse.json({ error: "Library item not found." }, { status: 404 });
    }

    return NextResponse.json({
      tags: item.tags.map(({ tag }) => ({ id: tag.id, category: tag.category, value: tag.value }))
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load library item tags.");
  }
}

/**
 * Attaches a typed `{category, value}` tag to a library item. The controlled
 * vocabulary is add-on-the-fly: a never-seen value creates a Tag row; an existing
 * `(category, value)` reuses it (unique). Connecting is idempotent against
 * `@@unique([libraryItemId, tagId])`. Gated by canManageLibrary.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const item = await prisma.libraryItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Library item not found." }, { status: 404 });
    }

    const parsed = tagBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid tag.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { category, value } = parsed.data;

    // Find-or-create the Tag (controlled vocabulary, add-on-the-fly) against the
    // `@@unique([category, value])` constraint.
    const tag = await prisma.tag.upsert({
      where: { category_value: { category, value } },
      create: { category, value },
      update: {}
    });

    // Connect via LibraryItemTag; skipDuplicates makes re-adding the same tag a no-op.
    await prisma.libraryItemTag.createMany({
      data: [{ libraryItemId: item.id, tagId: tag.id }],
      skipDuplicates: true
    });

    return NextResponse.json(
      { tag: { id: tag.id, category: tag.category, value: tag.value } },
      { status: 201 }
    );
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to add library item tag.");
  }
}

/**
 * Detaches a typed `{category, value}` tag from a library item. Removes only the
 * LibraryItemTag join row — the shared Tag row (vocabulary) is left intact.
 * Idempotent (a missing join row is not an error). Gated by canManageLibrary.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const item = await prisma.libraryItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Library item not found." }, { status: 404 });
    }

    const parsed = tagBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid tag.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { category, value } = parsed.data;

    const tag = await prisma.tag.findUnique({
      where: { category_value: { category, value } }
    });
    if (tag) {
      await prisma.libraryItemTag.deleteMany({
        where: { libraryItemId: item.id, tagId: tag.id }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to remove library item tag.");
  }
}
