import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManageAssignedTeacher, canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { verifyCaptchaSubmission } from "@/lib/captcha";
import { prisma } from "@/lib/db";
import { getEmailHistoryForAddress } from "@/lib/email/history";
import { sendEmail } from "@/lib/email/service";
import { customerCustomMessageTemplate } from "@/lib/email/templates";

const targetBaseSchema = z.object({
  customerId: z.string().trim().min(1).optional(),
  bookingId: z.string().trim().min(1).optional(),
  bookingRequestId: z.string().trim().min(1).optional()
});

const targetSchema = targetBaseSchema.superRefine((data, ctx) => {
  const targetCount = [data.customerId, data.bookingId, data.bookingRequestId].filter(Boolean).length;
  if (targetCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide exactly one email history target.",
      path: ["customerId"]
    });
  }
});

const sendEmailSchema = targetBaseSchema.extend({
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().optional()
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

type ResolvedEmailTarget =
  | { errorResponse: NextResponse }
  | { email: string; normalizedEmail: string; customerIds?: string[]; displayName: string };

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

async function resolveEmailTarget(admin: Awaited<ReturnType<typeof requireAdminFromRequest>>, target: z.infer<typeof targetSchema>): Promise<ResolvedEmailTarget> {
  if (!admin) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (target.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: target.customerId },
      select: {
        id: true,
        fullName: true,
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
      customerIds: [customer.id],
      displayName: customer.fullName
    };
  }

  if (target.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: target.bookingId },
      select: {
        id: true,
        name: true,
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
      ),
      displayName: booking.name
    };
  }

  const bookingRequest = await prisma.bookingRequest.findUnique({
    where: { id: target.bookingRequestId! },
    select: {
      id: true,
      name: true,
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
    ),
    displayName: bookingRequest.name
  };
}

/**
 * GET: Returns recent email history for a customer, booking, or booking request target.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = targetSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email history target.", details: parsed.error.flatten() }, { status: 400 });
    }

    const resolvedTarget = await resolveEmailTarget(admin, parsed.data);
    if ("errorResponse" in resolvedTarget) {
      return resolvedTarget.errorResponse;
    }

    const history = await getEmailHistoryForAddress({
      email: resolvedTarget.email,
      normalizedEmail: resolvedTarget.normalizedEmail,
      customerIds: resolvedTarget.customerIds
    });

    return NextResponse.json({ history });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load email history.");
  }
}

/**
 * POST: Sends a custom email to the selected target.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = sendEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const resolvedTarget = await resolveEmailTarget(admin, parsed.data);
    if ("errorResponse" in resolvedTarget) {
      return resolvedTarget.errorResponse;
    }

    if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development") {
      const captchaResult = verifyCaptchaSubmission({
        captchaToken: parsed.data.captchaToken || "",
        captchaAnswer: parsed.data.captchaAnswer || ""
      });
      if (!captchaResult.ok) {
        return NextResponse.json({ error: captchaResult.message, code: captchaResult.code }, { status: 400 });
      }
    }

    const template = customerCustomMessageTemplate({
      name: resolvedTarget.displayName,
      subject: parsed.data.subject,
      message: parsed.data.message
    });

    const result = await sendEmail({
      to: resolvedTarget.email,
      subject: template.subject,
      html: template.html,
      notification: {
        triggerMode: "manual"
      }
    });

    if (result.status === "failed") {
      return NextResponse.json(
        { error: result.error || "Unable to send email." },
        { status: 502 }
      );
    }

    if (result.status === "queued_no_smtp") {
      return NextResponse.json(
        {
          error: "Email delivery is not configured on this host. Configure a live email provider before sending admin emails."
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
      message: "Email sent successfully."
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to send email.");
  }
}
