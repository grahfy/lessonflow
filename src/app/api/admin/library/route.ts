import { NextRequest, NextResponse } from "next/server";

import { canManageLibrary } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { verifyCaptchaSubmission } from "@/lib/captcha";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { refundBulkUploadGrantUnit, reserveBulkUploadGrantUnit } from "@/lib/library/bulk-upload-grant";
import { classifyLibraryFile, normalizeOriginalFilename } from "@/lib/library/library-file-classification";
import { buildLibrarySearchWhere, type LibraryTagFilter } from "@/lib/library/library-search";
import {
  declaredContentLengthExceedsUploadCap,
  MAX_MATERIAL_SIZE_BYTES
} from "@/lib/library/upload-limits";
import { logError } from "@/lib/observability";
import {
  createMaterialStorageDriver,
  getMaterialStorageDriverName
} from "@/lib/student-portal/material-storage";
import { getLocalMaterialStorageRoot } from "@/lib/student-portal/material-storage.local";
import {
  buildLibraryItemStorageKey,
  sanitizeLearningMaterialTitle
} from "@/lib/student-portal/materials";

/**
 * Parses repeatable `?tag=Category:Value` params into typed tag filters. Only the
 * FIRST colon separates category from value so values may themselves contain
 * colons. Malformed entries (missing category or value) are ignored.
 */
function parseTagFilters(searchParams: URLSearchParams): LibraryTagFilter[] {
  const filters: LibraryTagFilter[] = [];
  for (const raw of searchParams.getAll("tag")) {
    const separatorIndex = raw.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const category = raw.slice(0, separatorIndex).trim();
    const value = raw.slice(separatorIndex + 1).trim();
    if (category && value) {
      filters.push({ category, value });
    }
  }
  return filters;
}

/**
 * Serializes a LibraryItem (with tags) into the admin list payload shape.
 */
function serializeLibraryItem(item: {
  id: string;
  title: string;
  description: string | null;
  materialType: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
  tags: { tag: { id: string; category: string; value: string } }[];
}) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    materialType: item.materialType,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    tags: item.tags.map(({ tag }) => ({ id: tag.id, category: tag.category, value: tag.value })),
    previewUrl: `/api/admin/library/${item.id}?disposition=inline`,
    downloadUrl: `/api/admin/library/${item.id}?disposition=attachment`
  };
}

/**
 * Lists / searches shared library items. Category facets (repeatable
 * `?tag=Category:Value`) are AND-combined and the free-text `?q=` narrows within
 * that intersection (see buildLibrarySearchWhere). Gated by canManageLibrary
 * (any owner/teacher — the deliberate library-surface scoping bypass).
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tagFilters = parseTagFilters(request.nextUrl.searchParams);
    const q = request.nextUrl.searchParams.get("q")?.trim() || undefined;
    const where = buildLibrarySearchWhere({ tagFilters, q });

    const items = await prisma.libraryItem.findMany({
      where,
      include: {
        tags: {
          include: {
            tag: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json({
      items: items.map(serializeLibraryItem)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load library items.");
  }
}

/**
 * Finds an existing item the upload duplicates (spec: same original filename +
 * size). The probe compares the SAME normalized value the create stores, so
 * store-side and probe-side truncation can never diverge. Legacy rows
 * (originalFilename NULL — pre-column uploads and promoted materials) fall back
 * to a lower-confidence match on the server-derived title + size. Oldest match
 * wins so the flagged "existing item" is the original master.
 */
async function findDuplicateLibraryItem(input: {
  originalFilename: string;
  derivedTitle: string;
  sizeBytes: number;
}): Promise<{ id: string; title: string; matchKind: "filename" | "legacy_title" } | null> {
  const filenameMatch = await prisma.libraryItem.findFirst({
    where: { originalFilename: input.originalFilename, sizeBytes: input.sizeBytes },
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" }
  });
  if (filenameMatch) {
    return { id: filenameMatch.id, title: filenameMatch.title, matchKind: "filename" };
  }

  const legacyMatch = await prisma.libraryItem.findFirst({
    where: { originalFilename: null, title: input.derivedTitle, sizeBytes: input.sizeBytes },
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" }
  });
  if (legacyMatch) {
    return { id: legacyMatch.id, title: legacyMatch.title, matchKind: "legacy_title" };
  }

  return null;
}

/**
 * Uploads one file into the shared library (no customer scope). Mirrors the admin
 * customer-material upload: 100MB cap, MIME allow-list, and CAPTCHA parity
 * (enforced outside test/development) — a file POST may instead carry a bulk
 * `grantId` minted by /api/admin/library/bulk-batches, which covers a whole
 * batch off one CAPTCHA solve. storage.put → create LibraryItem, with a
 * compensating best-effort storage.delete if the metadata write fails.
 *
 * The grant unit is reserved synchronously at the grant check and refunded on
 * EVERY subsequent failure path (reserve-at-accept / refund-on-failure), so a
 * failed upload consumes nothing net and concurrent POSTs cannot race past the
 * batch cap. The grant is parity + cap enforcement, not the auth boundary —
 * that remains the admin session above.
 */
export async function POST(request: NextRequest) {
  // Set once a grant unit is reserved; every failure return below must call it.
  let refundReservedUnit: (() => void) | null = null;
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Reject clearly-oversized requests off the declared content-length BEFORE
    // formData() buffers the body. This runs before the grant unit is reserved
    // (the grantId lives in the form, which is never read here), so there is no
    // refund interaction. Absent/unparseable header falls through to the
    // post-parse file-size guard below.
    if (declaredContentLengthExceedsUploadCap(request.headers.get("content-length"))) {
      return NextResponse.json({ error: "File must be between 1 byte and 100MB." }, { status: 400 });
    }

    const form = await request.formData().catch((error) => {
      logError("api.library.form_data_failed", error);
      return null;
    });
    if (!form) {
      return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
    }

    const title = sanitizeLearningMaterialTitle(String(form.get("title") || ""));
    const rawDescription = String(form.get("description") || "").trim().slice(0, 500);
    const description = rawDescription || null;
    const file = form.get("file");

    // CAPTCHA parity with the customer-material upload — enforced in production for
    // defence-in-depth; dev/test bypass keeps workflows fast. Grant-or-captcha:
    // a bulk grantId (fail-closed: invalid/expired/exhausted → 400) or a
    // single-use captcha solve.
    if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development") {
      const grantId = String(form.get("grantId") || "").trim();
      if (grantId) {
        const reservation = reserveBulkUploadGrantUnit({ grantId, adminId: admin.id });
        if (!reservation.ok) {
          return NextResponse.json({ error: reservation.message, code: reservation.code }, { status: 400 });
        }
        // Self-nulling: disarm BEFORE refunding so a failure path that refunds
        // and then throws can't refund a second time from the outer catch.
        refundReservedUnit = () => {
          refundReservedUnit = null;
          refundBulkUploadGrantUnit({ grantId, adminId: admin.id });
        };
      } else {
        const captchaToken = String(form.get("captchaToken") || "").trim();
        const captchaAnswer = String(form.get("captchaAnswer") || "").trim();
        const captchaResult = verifyCaptchaSubmission({ captchaToken, captchaAnswer });
        if (!captchaResult.ok) {
          return NextResponse.json({ error: captchaResult.message, code: captchaResult.code }, { status: 400 });
        }
      }
    }

    if (!(file instanceof File)) {
      refundReservedUnit?.();
      return NextResponse.json({ error: "Library file is required." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_MATERIAL_SIZE_BYTES) {
      refundReservedUnit?.();
      return NextResponse.json({ error: "File must be between 1 byte and 100MB." }, { status: 400 });
    }

    const classification = classifyLibraryFile({
      fileName: file.name,
      mimeType: file.type
    });
    if (!classification) {
      refundReservedUnit?.();
      return NextResponse.json(
        {
          error:
            "Only PDF, common audio, image (JPEG, PNG, GIF, WebP), and Guitar Pro (.gp3, .gp4, .gp5, .gpx, .gp) files are supported."
        },
        { status: 400 }
      );
    }

    // Duplicate probe (pre-insert, so the new row can never match itself). The
    // derived title mirrors how legacy titles were actually created: the client
    // defaulted the title to the filename sans extension (use-library.ts) and the
    // server sanitized it — comparing the raw basename would miss every
    // sanitized legacy row.
    const originalFilename = normalizeOriginalFilename(file.name);
    const baseName = file.name.replace(/\\/g, "/").split("/").pop() ?? "";
    const derivedTitle = sanitizeLearningMaterialTitle(baseName.replace(/\.[^.]+$/, ""));
    const duplicateOf = await findDuplicateLibraryItem({
      originalFilename,
      derivedTitle,
      sizeBytes: file.size
    });

    const storageKey = buildLibraryItemStorageKey({ extension: classification.extension });
    const storageDriverName = getMaterialStorageDriverName();
    const storage = createMaterialStorageDriver();
    const buffer = Buffer.from(await file.arrayBuffer());

    try {
      await storage.put({
        storageKey,
        buffer,
        mimeType: classification.mimeType
      });
    } catch (error) {
      refundReservedUnit?.();
      if (error instanceof AppError) {
        return jsonUnexpectedError(error, "Unable to store library file. Check the configured storage path and permissions.");
      }

      logError("library_item.storage_put_failed", error, {
        storageDriver: storageDriverName,
        storageKey,
        storageRoot: storageDriverName === "local" ? getLocalMaterialStorageRoot() : null
      });

      return NextResponse.json(
        {
          error: "Unable to store library file. Check the configured storage path and permissions.",
          code: "LIBRARY_ITEM_STORAGE_FAILED"
        },
        { status: 500 }
      );
    }

    try {
      const item = await prisma.libraryItem.create({
        data: {
          title,
          description,
          materialType: classification.materialType,
          storageKey,
          mimeType: classification.mimeType,
          sizeBytes: file.size,
          originalFilename,
          uploadedById: admin.id
        },
        include: {
          tags: {
            include: {
              tag: true
            }
          }
        }
      });

      // `duplicateOf` lives only in this POST envelope — serializeLibraryItem is
      // shared with GET and stays duplicate-free. The item IS still created on a
      // duplicate hit (spec: "uploaded but flagged"); the review step resolves it.
      return NextResponse.json({ item: serializeLibraryItem(item), duplicateOf }, { status: 201 });
    } catch (error) {
      refundReservedUnit?.();
      // Metadata write failed after the blob upload; best-effort cleanup avoids orphaned storage files.
      await storage.delete({ storageKey }).catch((cleanupError) => {
        logError("library_item.storage_delete_failed", cleanupError, {
          storageKey,
          phase: "upload_compensation"
        });
      });
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to save library item metadata." },
        { status: 500 }
      );
    }
  } catch (error) {
    refundReservedUnit?.();
    return jsonUnexpectedError(error, "Unable to upload library item.");
  }
}
