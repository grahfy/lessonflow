import { NextRequest, NextResponse } from "next/server";

import { canManageAssignedTeacher, canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { AppError } from "@/lib/errors";
import { verifyCaptchaSubmission } from "@/lib/captcha";
import { prisma } from "@/lib/db";
import { compareTreeOrder, libraryTreeId, materialOrderBy } from "@/lib/materials/reorder";
import { logError } from "@/lib/observability";
import { createMaterialStorageDriver, getMaterialStorageDriverName } from "@/lib/student-portal/material-storage";
import { getLocalMaterialStorageRoot } from "@/lib/student-portal/material-storage.local";
import {
  buildLearningMaterialStorageKey,
  classifyLearningMaterialFile,
  sanitizeLearningMaterialTitle
} from "@/lib/student-portal/materials";
import {
  assertSameCustomerFolder,
  buildFolderTree,
  FolderValidationError
} from "@/lib/student-portal/folders";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const MAX_MATERIAL_SIZE_BYTES = 100 * 1024 * 1024;
// Upper bound on files accepted in a single batch upload. `form.getAll("file")`
// is otherwise unbounded, so a crafted multipart request could enqueue an
// arbitrary number of large files for storage/DB work. The admin UI batches well
// under this cap; the single-file path (1 file) is never affected.
const MAX_FILES_PER_BATCH = 25;

/**
 * Lists customer-owned appointments and learning materials for the selected booking scope.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: {
        id
      }
    });
    if (!customer || customer.isArchived) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Optional booking filter lets the admin modal narrow materials to one appointment while
    // preserving a "show all customer materials" view.
    const bookingId = request.nextUrl.searchParams.get("bookingId")?.trim() || null;
    if (bookingId) {
      const ownsBooking = await prisma.booking.findFirst({
        where: {
          id: bookingId,
          customerId: customer.id
        }
      });
      if (!ownsBooking) {
        return NextResponse.json({ error: "Selected appointment is not linked to this customer." }, { status: 400 });
      }
      if (!canManageAssignedTeacher(admin, ownsBooking.assignedTeacherId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Load bookings, materials, and folders together because the modal needs all
    // datasets to drive the selectors, the list, and the folder tree (C0).
    const [bookings, materials, folders] = await Promise.all([
      prisma.booking.findMany({
        where: {
          customerId: customer.id,
          ...(admin.role === "teacher" ? { assignedTeacherId: admin.id } : {})
        },
        orderBy: {
          startAt: "desc"
        }
      }),
      prisma.learningMaterial.findMany({
        where: {
          customerId: customer.id,
          ...(bookingId ? { bookingId } : {}),
          ...(admin.role === "teacher"
            ? {
                OR: [
                  { bookingId: null },
                  {
                    booking: {
                      assignedTeacherId: admin.id
                    }
                  }
                ]
              }
            : {})
        },
        orderBy: materialOrderBy
      }),
      prisma.studentMaterialFolder.findMany({
        where: {
          customerId: customer.id
        }
      })
    ]);

    // Assigned library items share the tree and the order with per-customer
    // materials, behind `lib:`-prefixed ids. They are join rows: no blob, no
    // storageKey, and the shared master is never touched from here.
    const libraryAssignments = await prisma.libraryAssignment.findMany({
      where: { customerId: customer.id },
      include: { libraryItem: true }
    });

    const treeMaterials = [
      ...materials.map((material) => ({
        id: material.id,
        title: material.title,
        description: material.description,
        bookingId: material.bookingId,
        folderId: material.folderId,
        sortOrder: material.sortOrder,
        materialType: material.materialType,
        mimeType: material.mimeType,
        sizeBytes: material.sizeBytes,
        createdAt: material.createdAt,
        previewUrl: `/api/admin/learning-materials/${material.id}?disposition=inline`,
        downloadUrl: `/api/admin/learning-materials/${material.id}?disposition=attachment`
      })),
      ...libraryAssignments.map((assignment) => ({
        id: libraryTreeId(assignment.libraryItemId),
        libraryItemId: assignment.libraryItemId,
        title: assignment.libraryItem.title,
        description: assignment.libraryItem.description,
        bookingId: null,
        folderId: assignment.folderId,
        sortOrder: assignment.sortOrder,
        materialType: assignment.libraryItem.materialType,
        mimeType: assignment.libraryItem.mimeType,
        sizeBytes: assignment.libraryItem.sizeBytes,
        // Assignment time, not the master's creation time.
        createdAt: assignment.createdAt,
        // There is no /api/admin/library/{id}/download route; the stream is the
        // collection route itself.
        previewUrl: `/api/admin/library/${assignment.libraryItemId}?disposition=inline`,
        downloadUrl: `/api/admin/library/${assignment.libraryItemId}?disposition=attachment`
      }))
    ]
      .sort(compareTreeOrder)
      .map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() }));

    return NextResponse.json({
      bookings: bookings.map((booking) => ({
        id: booking.id,
        startAt: booking.startAt.toISOString(),
        endAt: booking.endAt.toISOString(),
        status: booking.status,
        lessonMode: booking.lessonMode,
        lessonDuration: booking.lessonDuration,
        customDurationMinutes: booking.customDurationMinutes
      })),
      materials: treeMaterials,
      folders: buildFolderTree(folders)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load learning materials.");
  }
}

/** Shape of a successfully-created material as returned to the client. */
type UploadedMaterialPayload = {
  id: string;
  title: string;
  description: string | null;
  bookingId: string | null;
  folderId: string | null;
  sortOrder: number;
  materialType: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  previewUrl: string;
  downloadUrl: string;
};

/** One failed file in a batch upload, surfaced back to the admin for triage. */
type UploadFailure = {
  filename: string;
  message: string;
};

/**
 * Uploads one or more material files for a customer in a single batch,
 * optionally linking them to an appointment.
 *
 * Batch semantics: booking/folder linkage and the CAPTCHA challenge are
 * validated once for the whole request. Each file is then classified,
 * stored, and recorded independently — a bad file (wrong type/size) is
 * skipped into `errors` rather than failing the whole batch. When exactly
 * one file is submitted, the response keeps the original single-file
 * contract (`{ material }`) so existing single-file callers/tests are
 * unaffected; multi-file requests return the aggregate
 * `{ uploaded, errors }` envelope instead.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: {
        id
      }
    });
    if (!customer || customer.isArchived) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await request.formData().catch((error) => {
      logError("api.learning-materials.form_data_failed", error);
      return null;
    });
    if (!form) {
      return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
    }

    const bookingId = String(form.get("bookingId") || "").trim();
    const folderId = String(form.get("folderId") || "").trim();
    // Optional free-text description; trim and cap at 500 characters to prevent
    // excessively long values, store null when the admin leaves it blank.
    const rawDescription = String(form.get("description") || "").trim().slice(0, 500);
    const description = rawDescription || null;

    // Repeated "file" field carries the whole batch; "title" entries (if any) are
    // appended by the client in the same order so they can be zipped by index. A
    // missing/blank title at a given index falls back to that file's own filename,
    // matching the previous single-file default.
    const files = form.getAll("file").filter((entry): entry is File => entry instanceof File);
    const rawTitles = form.getAll("title").map((entry) => String(entry));

    // CAPTCHA verification — enforced in production to add defence-in-depth on top of
    // session authentication. Dev/test environments bypass this to keep workflows fast.
    // Verified once for the whole batch, not per file.
    if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development") {
      const captchaToken = String(form.get("captchaToken") || "").trim();
      const captchaAnswer = String(form.get("captchaAnswer") || "").trim();
      const captchaResult = verifyCaptchaSubmission({ captchaToken, captchaAnswer });
      if (!captchaResult.ok) {
        return NextResponse.json({ error: captchaResult.message, code: captchaResult.code }, { status: 400 });
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "Learning material file is required." }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_BATCH) {
      return NextResponse.json(
        { error: `You can upload at most ${MAX_FILES_PER_BATCH} files at once.` },
        { status: 400 }
      );
    }

    let linkedBookingId: string | null = null;
    if (bookingId) {
      const booking = await prisma.booking.findFirst({
        where: {
          id: bookingId,
          customerId: customer.id
        }
      });
      if (!booking) {
        return NextResponse.json({ error: "Selected appointment is not linked to this customer." }, { status: 400 });
      }
      if (!canManageAssignedTeacher(admin, booking.assignedTeacherId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      linkedBookingId = booking.id;
    }

    // Destination folder is independent of the booking link (AC-9): a material may
    // be booking-linked AND placed in an arbitrary folder. Validate same-customer
    // ownership (INV-3) before storing.
    let linkedFolderId: string | null = null;
    if (folderId) {
      const folder = await prisma.studentMaterialFolder.findUnique({
        where: {
          id: folderId
        }
      });
      if (!folder) {
        return NextResponse.json({ error: "Selected folder is not linked to this customer." }, { status: 400 });
      }
      try {
        assertSameCustomerFolder(customer.id, folder);
      } catch (error) {
        if (error instanceof FolderValidationError) {
          return NextResponse.json({ error: "Selected folder is not linked to this customer." }, { status: 400 });
        }
        throw error;
      }
      linkedFolderId = folder.id;
    }

    const storageDriverName = getMaterialStorageDriverName();
    const storage = createMaterialStorageDriver();
    const isSingleFile = files.length === 1;

    const uploaded: UploadedMaterialPayload[] = [];
    const errors: UploadFailure[] = [];

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const filename = file.name || "Unnamed file";
      const explicitTitle = rawTitles[index]?.trim();
      const fallbackTitle = file.name.replace(/\.[^.]+$/, "");
      const title = sanitizeLearningMaterialTitle(explicitTitle || fallbackTitle);

      if (file.size <= 0 || file.size > MAX_MATERIAL_SIZE_BYTES) {
        if (isSingleFile) {
          return NextResponse.json({ error: "File must be between 1 byte and 100MB." }, { status: 400 });
        }
        errors.push({ filename, message: "File must be between 1 byte and 100MB." });
        continue;
      }

      // File classification normalizes MIME/extension handling and enforces allowed upload types.
      const classification = classifyLearningMaterialFile({
        fileName: file.name,
        mimeType: file.type
      });
      if (!classification) {
        const message = "Only PDF, common audio, and image files (JPEG, PNG, GIF, WebP) are supported.";
        if (isSingleFile) {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        errors.push({ filename, message });
        continue;
      }

      const storageKey = buildLearningMaterialStorageKey({
        customerId: customer.id,
        bookingId: linkedBookingId,
        extension: classification.extension
      });

      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        await storage.put({
          storageKey,
          buffer,
          mimeType: classification.mimeType
        });
      } catch (error) {
        if (error instanceof AppError) {
          if (isSingleFile) {
            return jsonUnexpectedError(error, "Unable to store learning material file. Check the configured storage path and permissions.");
          }
          errors.push({ filename, message: "Unable to store learning material file." });
          continue;
        }

        logError("learning_material.storage_put_failed", error, {
          customerId: customer.id,
          bookingId: linkedBookingId,
          storageDriver: storageDriverName,
          storageKey,
          storageRoot: storageDriverName === "local" ? getLocalMaterialStorageRoot() : null
        });

        if (isSingleFile) {
          return NextResponse.json(
            {
              error: "Unable to store learning material file. Check the configured storage path and permissions.",
              code: "LEARNING_MATERIAL_STORAGE_FAILED"
            },
            { status: 500 }
          );
        }
        errors.push({ filename, message: "Unable to store learning material file. Check the configured storage path and permissions." });
        continue;
      }

      try {
        const material = await prisma.learningMaterial.create({
          data: {
            customerId: customer.id,
            bookingId: linkedBookingId,
            folderId: linkedFolderId,
            uploadedById: admin.id,
            title,
            description,
            materialType: classification.materialType,
            storageKey,
            mimeType: classification.mimeType,
            sizeBytes: file.size
          }
        });

        uploaded.push({
          id: material.id,
          title: material.title,
          description: material.description,
          bookingId: material.bookingId,
          folderId: material.folderId,
          sortOrder: material.sortOrder,
          materialType: material.materialType,
          mimeType: material.mimeType,
          sizeBytes: material.sizeBytes,
          createdAt: material.createdAt.toISOString(),
          previewUrl: `/api/admin/learning-materials/${material.id}?disposition=inline`,
          downloadUrl: `/api/admin/learning-materials/${material.id}?disposition=attachment`
        });
      } catch (error) {
        // Metadata write failed after the blob upload; best-effort cleanup avoids orphaned storage files.
        await storage.delete({ storageKey }).catch(() => null);
        const message = error instanceof Error ? error.message : "Unable to save learning material metadata.";
        if (isSingleFile) {
          return NextResponse.json({ error: message }, { status: 500 });
        }
        errors.push({ filename, message: "Unable to save learning material metadata." });
      }
    }

    if (isSingleFile) {
      // Exactly one file: keep the original single-file response contract. Any
      // failure above already returned inline; only the success case reaches here.
      return NextResponse.json({ material: uploaded[0] }, { status: 201 });
    }

    // Batch response: 201 when everything succeeded, 207 for a mix of
    // successes/failures, 400 when every file in the batch failed.
    const status = uploaded.length === 0 ? 400 : errors.length > 0 ? 207 : 201;
    return NextResponse.json({ uploaded, errors }, { status });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to upload learning material.");
  }
}
