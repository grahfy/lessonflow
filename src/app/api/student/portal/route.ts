import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  mapStudentPortalBooking,
  mapStudentPortalFolder,
  mapStudentPortalLibraryItem,
  mapStudentPortalMaterial,
  mapStudentPortalPendingRequest,
  studentPortalPayloadSchema
} from "@/lib/student-portal/contracts";
import { buildFolderTree } from "@/lib/student-portal/folders";
import { requireStudentFromRequest } from "@/lib/student-portal/session";
import { getLessonCreditSummary } from "@/lib/credits/lesson-credits";
import { getAccountCreditBalanceCents } from "@/lib/vouchers/account-credit";

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
        },
        // Surface pending reschedule requests so the portal can show "reschedule
        // requested" state and block a duplicate request on the same booking.
        rescheduleRequests: {
          where: {
            status: "pending"
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
        // Show both pending and waitlisted requests so the student can see a request that has been
        // parked on the waitlist (awaiting a free slot) rather than it silently disappearing.
        status: { in: ["pending", "waitlisted"] },
        requestedStartAt: {
          gte: now
        }
      },
      orderBy: {
        requestedStartAt: "asc"
      }
    })
  ]);
  // Fetch standalone (non-booking) materials and the student's folder set together;
  // both are scoped to the authenticated student's customerId (AC-12).
  const [standaloneMaterials, folders] = await Promise.all([
    prisma.learningMaterial.findMany({
      where: {
        customerId: student.id,
        bookingId: null
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.studentMaterialFolder.findMany({
      where: {
        customerId: student.id
      }
    })
  ]);

  // Library items assigned to this student by a teacher ("Assigned by teacher").
  // Authorized purely by the LibraryAssignment join (no ownership field on the
  // shared master); tags are included for display. Ordered newest-assigned first.
  const libraryAssignments = await prisma.libraryAssignment.findMany({
    where: {
      customerId: student.id
    },
    include: {
      libraryItem: {
        include: {
          tags: {
            include: {
              tag: true
            }
          }
        }
      }
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

  // Build the read-only folder tree (folder = the only grouping axis; C0/AC-10).
  // `materialIds` are not needed in the payload — the client groups materials by
  // their own `folderId`, so an empty material map keeps the tree pure structure.
  const folderTree = buildFolderTree(folders).map(mapStudentPortalFolder);

  // Summarise the student's currently-usable prepaid lesson credits so the
  // portal can show "X lessons remaining" (non-expired, with credits left).
  const creditSummary = await getLessonCreditSummary(student.id, prisma, now);

  // The student's monetary account-credit balance (e.g. from redeemed vouchers)
  // so the portal can show "Account credit: $X".
  const accountCreditCents = await getAccountCreditBalanceCents(student.id);

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
    folders: folderTree,
    assignedByTeacher: libraryAssignments.map(mapStudentPortalLibraryItem),
    pendingRequests: pendingRequests.map(mapStudentPortalPendingRequest),
    lessonCredits: {
      totalRemaining: creditSummary.totalRemaining,
      batches: creditSummary.batches.map((batch) => ({
        id: batch.id,
        durationMinutes: batch.durationMinutes,
        remainingQuantity: batch.remainingQuantity,
        expiresAt: batch.expiresAt ? batch.expiresAt.toISOString() : null
      }))
    },
    accountCreditCents
  });

  return NextResponse.json(payload);
}
