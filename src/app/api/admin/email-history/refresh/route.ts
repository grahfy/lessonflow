import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { canManageAssignedTeacher, canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { refreshEmailHistoryForAddress } from "@/lib/email/history";

const targetSchema = z.object({
  customerId: z.string().trim().min(1).optional(),
  bookingId: z.string().trim().min(1).optional(),
  bookingRequestId: z.string().trim().min(1).optional()
}).superRefine((data, ctx) => {
  const targetCount = [data.customerId, data.bookingId, data.bookingRequestId].filter(Boolean).length;
  if (targetCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide exactly one email history target.",
      path: ["customerId"]
    });
  }
});

type ResolvedRefreshTarget =
  | { errorResponse: NextResponse }
  | { email: string; normalizedEmail: string; customerIds?: string[] };

async function resolveAuthorizedCustomerIds(
  admin: NonNullable<Awaited<ReturnType<typeof requireAdminFromRequest>>>,
  normalizedEmail: string,
  candidateCustomerIds?: string[]
): Promise<string[]> {
  const uniqueCandidateIds = candidateCustomerIds ? Array.from(new Set(candidateCustomerIds)) : [];

  const customers = await prisma.customer.findMany({
    where: uniqueCandidateIds.length > 0
      ? {
          id: {
            in: uniqueCandidateIds
          },
          ...(admin.role === "owner" ? {} : { primaryTeacherId: admin.id })
        }
      : {
          normalizedEmail,
          ...(admin.role === "owner" ? {} : { primaryTeacherId: admin.id })
        },
    select: {
      id: true
    }
  });

  return customers.map((customer) => customer.id);
}

async function resolveRefreshTarget(admin: Awaited<ReturnType<typeof requireAdminFromRequest>>, target: z.infer<typeof targetSchema>): Promise<ResolvedRefreshTarget> {
  if (!admin) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (target.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: target.customerId },
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        primaryTeacherId: true
      }
    });

    if (!customer) {
      return { errorResponse: NextResponse.json({ error: "Customer not found." }, { status: 404 }) };
    }
    if (!canManagePrimaryTeacherCustomer(admin, customer.primaryTeacherId)) {
      return { errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    return {
      email: customer.email,
      normalizedEmail: customer.normalizedEmail,
      customerIds: [customer.id]
    };
  }

  if (target.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: target.bookingId },
      select: {
        id: true,
        email: true,
        customerId: true,
        assignedTeacherId: true,
        customer: {
          select: {
            normalizedEmail: true
          }
        }
      }
    });

    if (!booking) {
      return { errorResponse: NextResponse.json({ error: "Booking not found." }, { status: 404 }) };
    }
    if (!canManageAssignedTeacher(admin, booking.assignedTeacherId)) {
      return { errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    return {
      email: booking.email,
      normalizedEmail: booking.customer?.normalizedEmail || booking.email.trim().toLowerCase(),
      customerIds: await resolveAuthorizedCustomerIds(
        admin,
        booking.customer?.normalizedEmail || booking.email.trim().toLowerCase(),
        booking.customerId ? [booking.customerId] : undefined
      )
    };
  }

  const bookingRequest = await prisma.bookingRequest.findUnique({
    where: { id: target.bookingRequestId! },
    select: {
      id: true,
      email: true,
      customerId: true,
      assignedTeacherId: true,
      customer: {
        select: {
          normalizedEmail: true
        }
      }
    }
  });

  if (!bookingRequest) {
    return { errorResponse: NextResponse.json({ error: "Booking request not found." }, { status: 404 }) };
  }
  if (!canManageAssignedTeacher(admin, bookingRequest.assignedTeacherId)) {
    return { errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    email: bookingRequest.email,
    normalizedEmail: bookingRequest.customer?.normalizedEmail || bookingRequest.email.trim().toLowerCase(),
    customerIds: await resolveAuthorizedCustomerIds(
      admin,
      bookingRequest.customer?.normalizedEmail || bookingRequest.email.trim().toLowerCase(),
      bookingRequest.customerId ? [bookingRequest.customerId] : undefined
    )
  };
}

/**
 * POST: Refreshes provider-backed email history for a selected email-history target.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = targetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email history target.", details: parsed.error.flatten() }, { status: 400 });
    }

    const resolvedTarget = await resolveRefreshTarget(admin, parsed.data);
    if ("errorResponse" in resolvedTarget) {
      return resolvedTarget.errorResponse;
    }

    const result = await refreshEmailHistoryForAddress({
      email: resolvedTarget.email,
      normalizedEmail: resolvedTarget.normalizedEmail,
      customerIds: resolvedTarget.customerIds
    }, {
      gmailMaxResults: 100,
      imapMaxResults: 20
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("No mailbox providers are configured")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return jsonUnexpectedError(error, "Unable to refresh email history.");
  }
}
