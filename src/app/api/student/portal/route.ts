import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireStudentFromRequest } from "@/lib/student-portal/session";

/**
 * Returns the authenticated student's appointment history and linked learning materials.
 */
export async function GET(request: NextRequest) {
  const student = await requireStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Fetch bookings + pending requests together because the portal UI renders both confirmed
  // appointments and pending requests from a single payload.
  const [bookings, pendingRequests] = await Promise.all([
    prisma.booking.findMany({
      where: {
        customerId: student.id
      },
      include: {
        learningMaterials: {
          where: {
            customerId: student.id
          },
          orderBy: {
            createdAt: "desc"
          }
        }
      },
      orderBy: {
        startAt: "asc"
      }
    }),
    prisma.bookingRequest.findMany({
      where: {
        customerId: student.id,
        status: "pending",
        requestedStartAt: {
          gte: now
        }
      },
      orderBy: {
        requestedStartAt: "asc"
      }
    })
  ]);
  const standaloneMaterials = await prisma.learningMaterial.findMany({
    where: {
      customerId: student.id,
      bookingId: null
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  // Split into upcoming/previous here so all student-facing clients can reuse the same route shape.
  const upcoming = bookings
    .filter((booking) => booking.startAt >= now && booking.status !== "cancelled")
    .map((booking) => ({
      id: booking.id,
      status: booking.status,
      lessonMode: booking.lessonMode,
      skillLevel: booking.skillLevel,
      lessonDuration: booking.lessonDuration,
      customDurationMinutes: booking.customDurationMinutes,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      notes: booking.notes,
      materials: booking.learningMaterials.map((material) => ({
        id: material.id,
        title: material.title,
        materialType: material.materialType,
        mimeType: material.mimeType,
        sizeBytes: material.sizeBytes,
        createdAt: material.createdAt.toISOString(),
        downloadUrl: `/api/student/learning-materials/${material.id}/download`,
        previewUrl: `/api/student/learning-materials/${material.id}/download?disposition=inline`
      }))
    }));

  const previous = bookings
    .filter((booking) => booking.startAt < now || booking.status === "cancelled")
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
    .map((booking) => ({
      id: booking.id,
      status: booking.status,
      lessonMode: booking.lessonMode,
      skillLevel: booking.skillLevel,
      lessonDuration: booking.lessonDuration,
      customDurationMinutes: booking.customDurationMinutes,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      notes: booking.notes,
      materials: booking.learningMaterials.map((material) => ({
        id: material.id,
        title: material.title,
        materialType: material.materialType,
        mimeType: material.mimeType,
        sizeBytes: material.sizeBytes,
        createdAt: material.createdAt.toISOString(),
        downloadUrl: `/api/student/learning-materials/${material.id}/download`,
        previewUrl: `/api/student/learning-materials/${material.id}/download?disposition=inline`
      }))
    }));

  return NextResponse.json({
    student: {
      id: student.id,
      fullName: student.fullName,
      postcode: student.postcode
    },
    now: now.toISOString(),
    upcoming,
    previous,
    standaloneMaterials: standaloneMaterials.map((material) => ({
      id: material.id,
      title: material.title,
      materialType: material.materialType,
      mimeType: material.mimeType,
      sizeBytes: material.sizeBytes,
      createdAt: material.createdAt.toISOString(),
      downloadUrl: `/api/student/learning-materials/${material.id}/download`,
      previewUrl: `/api/student/learning-materials/${material.id}/download?disposition=inline`
    })),
    pendingRequests: pendingRequests.map((requestRow) => ({
      id: requestRow.id,
      requestedStartAt: requestRow.requestedStartAt.toISOString(),
      lessonMode: requestRow.lessonMode,
      lessonDuration: requestRow.lessonDuration,
      customDurationMinutes: requestRow.customDurationMinutes,
      status: requestRow.status
    }))
  });
}
