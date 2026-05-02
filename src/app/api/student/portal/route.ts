import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  mapStudentPortalBooking,
  mapStudentPortalMaterial,
  mapStudentPortalPendingRequest,
  studentPortalPayloadSchema
} from "@/lib/student-portal/contracts";
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
        },
        lessonPlan: {
          select: {
            sections: true,
            status: true,
            quickCaptureNotes: true
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
    .map((booking) =>
      mapStudentPortalBooking(booking)
    );

  const previous = bookings
    .filter((booking) => booking.startAt < now || booking.status === "cancelled")
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
    .map((booking) =>
      mapStudentPortalBooking(booking)
    );

  const payload = studentPortalPayloadSchema.parse({
    student: {
      id: student.id,
      fullName: student.fullName,
      postcode: student.postcode
    },
    now: now.toISOString(),
    upcoming,
    previous,
    standaloneMaterials: standaloneMaterials.map(mapStudentPortalMaterial),
    pendingRequests: pendingRequests.map(mapStudentPortalPendingRequest)
  });

  return NextResponse.json(payload);
}
