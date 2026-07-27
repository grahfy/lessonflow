import type { AdminUser } from "@/generated/prisma/client";

import { canManageAssignedTeacher, canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { prisma } from "@/lib/db";

/**
 * Resolves a booking and applies the existing two-tier customer/booking scope.
 * Booking Library links are per-booking material state, not general Library
 * administration, so the broad Library-assignment permission is not used here.
 */
export async function getAuthorizedBookingLibraryContext(admin: Pick<AdminUser, "id" | "role">, bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: {
        select: { id: true, isArchived: true, primaryTeacherId: true }
      }
    }
  });

  if (!booking || !booking.customer || booking.customer.isArchived) {
    return { kind: "not_found" as const };
  }
  if (!canManagePrimaryTeacherCustomer(admin, booking.customer.primaryTeacherId)) {
    return { kind: "forbidden" as const };
  }
  if (!canManageAssignedTeacher(admin, booking.assignedTeacherId)) {
    return { kind: "forbidden" as const };
  }

  return { kind: "ok" as const, booking };
}
