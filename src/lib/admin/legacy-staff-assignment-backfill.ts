import { Prisma } from "@/generated/prisma/client";

type DbClient = Prisma.TransactionClient | typeof import("@/lib/db").prisma;

export type LegacyStaffAssignmentBackfillResult =
  | {
      status: "skipped";
      reason: "non_local_site_url" | "no_owner" | "existing_assignments_detected";
      siteUrl: string;
    }
  | {
      status: "updated";
      reason: "backfilled";
      siteUrl: string;
      ownerId: string;
      counts: {
        customers: number;
        bookingRequests: number;
        bookingSeries: number;
        bookings: number;
      };
    };

/**
 * Detects whether the configured site URL represents a local/dev-style host
 * where legacy assignment backfills are allowed to run automatically.
 */
export function isLocalDevelopmentSiteUrl(siteUrl: string | null | undefined): boolean {
  const trimmed = siteUrl?.trim() || "";
  if (!trimmed) {
    return false;
  }

  try {
    const hostname = new URL(trimmed).hostname.trim().toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * Backfills legacy appointment/customer assignment fields for local/dev-style
 * upgrades only when the dataset is still entirely unassigned.
 */
export async function backfillLegacyStaffAssignments(input: {
  db: DbClient;
  siteUrl?: string | null;
}): Promise<LegacyStaffAssignmentBackfillResult> {
  const siteUrl = input.siteUrl?.trim() || "";

  if (!isLocalDevelopmentSiteUrl(siteUrl)) {
    return {
      status: "skipped",
      reason: "non_local_site_url",
      siteUrl
    };
  }

  const owner = await input.db.adminUser.findFirst({
    where: {
      role: "owner"
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true
    }
  });

  if (!owner) {
    return {
      status: "skipped",
      reason: "no_owner",
      siteUrl
    };
  }

  const [assignedCustomers, assignedRequests, assignedSeries, assignedBookings] = await Promise.all([
    input.db.customer.count({
      where: {
        primaryTeacherId: {
          not: null
        }
      }
    }),
    input.db.bookingRequest.count({
      where: {
        assignedTeacherId: {
          not: null
        }
      }
    }),
    input.db.bookingSeries.count({
      where: {
        assignedTeacherId: {
          not: null
        }
      }
    }),
    input.db.booking.count({
      where: {
        assignedTeacherId: {
          not: null
        }
      }
    })
  ]);

  if (assignedCustomers + assignedRequests + assignedSeries + assignedBookings > 0) {
    return {
      status: "skipped",
      reason: "existing_assignments_detected",
      siteUrl
    };
  }

  const [customers, bookingRequests, bookingSeries, bookings] = await Promise.all([
    input.db.customer.updateMany({
      where: {
        primaryTeacherId: null
      },
      data: {
        primaryTeacherId: owner.id
      }
    }),
    input.db.bookingRequest.updateMany({
      where: {
        assignedTeacherId: null
      },
      data: {
        assignedTeacherId: owner.id
      }
    }),
    input.db.bookingSeries.updateMany({
      where: {
        assignedTeacherId: null
      },
      data: {
        assignedTeacherId: owner.id
      }
    }),
    input.db.booking.updateMany({
      where: {
        assignedTeacherId: null
      },
      data: {
        assignedTeacherId: owner.id
      }
    })
  ]);

  return {
    status: "updated",
    reason: "backfilled",
    siteUrl,
    ownerId: owner.id,
    counts: {
      customers: customers.count,
      bookingRequests: bookingRequests.count,
      bookingSeries: bookingSeries.count,
      bookings: bookings.count
    }
  };
}
