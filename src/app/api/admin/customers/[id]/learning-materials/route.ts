import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import {
  buildLearningMaterialStorageKey,
  classifyLearningMaterialFile,
  sanitizeLearningMaterialTitle
} from "@/lib/student-portal/materials";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const MAX_MATERIAL_SIZE_BYTES = 100 * 1024 * 1024;

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
    }

    // Load bookings and materials together because the modal needs both datasets to drive the
    // selector and the list.
    const [bookings, materials] = await Promise.all([
      prisma.booking.findMany({
        where: {
          customerId: customer.id
        },
        orderBy: {
          startAt: "desc"
        }
      }),
      prisma.learningMaterial.findMany({
        where: {
          customerId: customer.id,
          ...(bookingId ? { bookingId } : {})
        },
        orderBy: {
          createdAt: "desc"
        }
      })
    ]);

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
      materials: materials.map((material) => ({
        id: material.id,
        title: material.title,
        description: material.description,
        bookingId: material.bookingId,
        materialType: material.materialType,
        mimeType: material.mimeType,
        sizeBytes: material.sizeBytes,
        createdAt: material.createdAt.toISOString(),
        previewUrl: `/api/admin/learning-materials/${material.id}?disposition=inline`,
        downloadUrl: `/api/admin/learning-materials/${material.id}?disposition=attachment`
      }))
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load learning materials.");
  }
}

/**
 * Uploads one material file for a customer, optionally linking it to an appointment.
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

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
    }

    const bookingId = String(form.get("bookingId") || "").trim();
    const title = sanitizeLearningMaterialTitle(String(form.get("title") || ""));
    // Optional free-text description; trim and cap at 500 characters to prevent
    // excessively long values, store null when the admin leaves it blank.
    const rawDescription = String(form.get("description") || "").trim().slice(0, 500);
    const description = rawDescription || null;
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Learning material file is required." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_MATERIAL_SIZE_BYTES) {
      return NextResponse.json({ error: "File must be between 1 byte and 100MB." }, { status: 400 });
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
      linkedBookingId = booking.id;
    }

    // File classification normalizes MIME/extension handling and enforces allowed upload types.
    const classification = classifyLearningMaterialFile({
      fileName: file.name,
      mimeType: file.type
    });
    if (!classification) {
      return NextResponse.json({ error: "Only PDF and common audio files are supported." }, { status: 400 });
    }

    const storageKey = buildLearningMaterialStorageKey({
      customerId: customer.id,
      bookingId: linkedBookingId,
      extension: classification.extension
    });

    const storage = createMaterialStorageDriver();
    const buffer = Buffer.from(await file.arrayBuffer());
    await storage.put({
      storageKey,
      buffer,
      mimeType: classification.mimeType
    });

    try {
      const material = await prisma.learningMaterial.create({
        data: {
          customerId: customer.id,
          bookingId: linkedBookingId,
          uploadedById: admin.id,
          title,
          description,
          materialType: classification.materialType,
          storageKey,
          mimeType: classification.mimeType,
          sizeBytes: file.size
        }
      });

      return NextResponse.json(
        {
          material: {
            id: material.id,
            title: material.title,
            description: material.description,
            bookingId: material.bookingId,
            materialType: material.materialType,
            mimeType: material.mimeType,
            sizeBytes: material.sizeBytes,
            createdAt: material.createdAt.toISOString(),
            previewUrl: `/api/admin/learning-materials/${material.id}?disposition=inline`,
            downloadUrl: `/api/admin/learning-materials/${material.id}?disposition=attachment`
          }
        },
        { status: 201 }
      );
    } catch (error) {
      // Metadata write failed after the blob upload; best-effort cleanup avoids orphaned storage files.
      await storage.delete({ storageKey }).catch(() => null);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to save learning material metadata." },
        { status: 500 }
      );
    }
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to upload learning material.");
  }
}
