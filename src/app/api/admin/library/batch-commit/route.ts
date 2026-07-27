/**
 * Batch-Commit API (upload-then-tag review)
 *
 * POST applies the review step's edits — optional title + typed tags — across
 * up to 200 just-uploaded LibraryItems in ONE request (vs 600 sequential
 * per-item POSTs for a 200-item, 3-tag commit).
 *
 * TRANSACTION SEMANTICS: N sequential per-item `prisma.$transaction` calls,
 * each wrapped in try/catch AT THE ROUTE LEVEL — never try/catch inside one
 * interactive transaction (a caught error inside a single wrapping transaction
 * would roll back or poison the whole batch, losing the good items — the exact
 * opposite failure). Each item is atomic; failures are independent; the
 * response mirrors per-item statuses for the review summary UI.
 *
 * Tags reuse the idempotent find-or-create pattern from [id]/tags/route.ts:
 * Tag upsert against `@@unique([category, value])`, connect via LibraryItemTag
 * `createMany skipDuplicates` — so re-committing the same review is a no-op,
 * and bulk tagging only ever ADDS attached tags (the vocabulary route's
 * orphaned-facet filter is never regressed by this path).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageLibrary } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { MAX_BULK_UPLOAD_FILES } from "@/lib/library/bulk-upload-grant";
import { log } from "@/lib/observability";
import { sanitizeLearningMaterialTitle } from "@/lib/student-portal/materials";

/** Per-tag caps mirror the single-tag route (`[id]/tags/route.ts`). */
const batchCommitTagSchema = z.object({
  category: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(200)
});

const batchCommitItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(255).optional(),
  artist: z.string().trim().max(191).nullable().optional(),
  tags: z.array(batchCommitTagSchema).max(50)
});

const batchCommitBodySchema = z.object({
  items: z.array(batchCommitItemSchema).min(1).max(MAX_BULK_UPLOAD_FILES)
});

type BatchCommitResult = { id: string; ok: boolean; error?: string };

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = batchCommitBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid batch commit.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const results: BatchCommitResult[] = [];
    for (const entry of parsed.data.items) {
      try {
        await prisma.$transaction(async (tx) => {
          const item = await tx.libraryItem.findUnique({
            where: { id: entry.id },
            select: { id: true }
          });
          if (!item) {
            throw new Error("Library item not found.");
          }

          if (entry.title !== undefined) {
            await tx.libraryItem.update({
              where: { id: item.id },
              data: { title: sanitizeLearningMaterialTitle(entry.title), artist: entry.artist || null }
            });
          } else if (entry.artist !== undefined) {
            await tx.libraryItem.update({ where: { id: item.id }, data: { artist: entry.artist || null } });
          }

          for (const { category, value } of entry.tags) {
            const tag = await tx.tag.upsert({
              where: { category_value: { category, value } },
              create: { category, value },
              update: {}
            });
            await tx.libraryItemTag.createMany({
              data: [{ libraryItemId: item.id, tagId: tag.id }],
              skipDuplicates: true
            });
          }
        });
        results.push({ id: entry.id, ok: true });
      } catch (error) {
        log("warn", "library_item.batch_commit_failed", {
          id: entry.id,
          message: error instanceof Error ? error.message : String(error)
        });
        results.push({
          id: entry.id,
          ok: false,
          error: error instanceof Error ? error.message : "Unable to commit item."
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to commit batch review.");
  }
}
