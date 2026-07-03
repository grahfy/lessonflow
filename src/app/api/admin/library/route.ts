import { NextRequest, NextResponse } from "next/server";

import { canManageLibrary } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { verifyCaptchaSubmission } from "@/lib/captcha";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { buildLibrarySearchWhere, type LibraryTagFilter } from "@/lib/library/library-search";
import { logError } from "@/lib/observability";
import {
  createMaterialStorageDriver,
  getMaterialStorageDriverName
} from "@/lib/student-portal/material-storage";
import { getLocalMaterialStorageRoot } from "@/lib/student-portal/material-storage.local";
import {
  buildLibraryItemStorageKey,
  classifyLearningMaterialFile,
  sanitizeLearningMaterialTitle
} from "@/lib/student-portal/materials";

const MAX_MATERIAL_SIZE_BYTES = 100 * 1024 * 1024;

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
 * Uploads one file into the shared library (no customer scope). Mirrors the admin
 * customer-material upload: 100MB cap, MIME allow-list, and CAPTCHA parity
 * (enforced outside test/development). storage.put → create LibraryItem, with a
 * compensating best-effort storage.delete if the metadata write fails.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageLibrary(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    // defence-in-depth; dev/test bypass keeps workflows fast.
    if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development") {
      const captchaToken = String(form.get("captchaToken") || "").trim();
      const captchaAnswer = String(form.get("captchaAnswer") || "").trim();
      const captchaResult = verifyCaptchaSubmission({ captchaToken, captchaAnswer });
      if (!captchaResult.ok) {
        return NextResponse.json({ error: captchaResult.message, code: captchaResult.code }, { status: 400 });
      }
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Library file is required." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_MATERIAL_SIZE_BYTES) {
      return NextResponse.json({ error: "File must be between 1 byte and 100MB." }, { status: 400 });
    }

    const classification = classifyLearningMaterialFile({
      fileName: file.name,
      mimeType: file.type
    });
    if (!classification) {
      return NextResponse.json(
        { error: "Only PDF, common audio, and image files (JPEG, PNG, GIF, WebP) are supported." },
        { status: 400 }
      );
    }

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

      return NextResponse.json({ item: serializeLibraryItem(item) }, { status: 201 });
    } catch (error) {
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
    return jsonUnexpectedError(error, "Unable to upload library item.");
  }
}
