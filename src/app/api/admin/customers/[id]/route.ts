import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManagePrimaryTeacherCustomer, isOwner } from "@/lib/admin/permissions";
import { resolveAssignedTeacherId } from "@/lib/admin/teacher-assignment";
import { auPhoneSchema, auPostcodeSchema, auStateSchema, lessonModeSchema, skillLevelSchema } from "@/lib/booking-rules";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { normalizeEmail, normalizePhone } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { buildNameSearchTokens, normalizeFullNameForLookup } from "@/lib/student-portal/credentials";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const updateCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: auPhoneSchema.optional(),
  skillLevel: skillLevelSchema.optional(),
  lessonMode: lessonModeSchema.optional(),
  unitNumber: z.string().trim().max(20).optional().nullable(),
  houseNumber: z.string().trim().min(1).max(20).optional(),
  streetName: z.string().trim().max(120).optional(),
  streetType: z.string().trim().max(40).optional(),
  suburb: z.string().trim().max(80).optional(),
  state: auStateSchema.optional(),
  postcode: auPostcodeSchema.optional(),
  primaryTeacherId: z.string().trim().min(1).nullable().optional(),
  isArchived: z.boolean().optional()
});

/**
 * Returns one customer record for admin detail flows.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        primaryTeacher: {
          select: {
            id: true,
            displayName: true
          }
        },
        portalCredential: {
          select: {
            id: true,
            generatedAt: true,
            rotatedAt: true,
            isActive: true
          }
        }
      }
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ customer });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load customer.");
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid customer payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await params;
    const existing = await prisma.customer.findUnique({
      where: { id }
    });
    if (!existing) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, existing.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const nextPrimaryTeacherId =
      parsed.data.primaryTeacherId === undefined
        ? existing.primaryTeacherId
        : await resolveAssignedTeacherId({
            db: prisma,
            actor: admin,
            requestedAssignedTeacherId: parsed.data.primaryTeacherId,
            fallbackTeacherId: parsed.data.primaryTeacherId === null ? null : existing.primaryTeacherId
          });

    // Compute the full next-state customer values server-side so partial edits preserve lookup
    // normalization fields (email/phone/name tokens) consistently.
    const nextFirstName = parsed.data.firstName ?? existing.firstName;
    const nextLastName = parsed.data.lastName ?? existing.lastName;
    const nextEmail = parsed.data.email ?? existing.email;
    const nextPhone = parsed.data.phone ?? existing.phone;
    const nextFullName = parsed.data.fullName ?? existing.fullName;
    const normalizedEmail = normalizeEmail(nextEmail);
    const normalizedPhone = normalizePhone(nextPhone);
    const normalizedFullName = normalizeFullNameForLookup(nextFullName);
    const nameSearchTokens = buildNameSearchTokens(nextFullName);

    // Prevent duplicate active customers by normalized email/phone before updating.
    const duplicate = await prisma.customer.findFirst({
      where: {
        id: {
          not: id
        },
        isArchived: false,
        OR: [{ normalizedEmail }, { normalizedPhone }]
      }
    });
    if (duplicate) {
      return NextResponse.json(
        {
          error: "Another customer already uses this email or phone.",
          customer: duplicate
        },
        { status: 409 }
      );
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        firstName: nextFirstName,
        lastName: nextLastName,
        fullName: nextFullName,
        normalizedFullName,
        nameSearchTokens,
        email: nextEmail,
        phone: nextPhone,
        normalizedEmail,
        normalizedPhone,
        skillLevel: parsed.data.skillLevel ?? existing.skillLevel,
        lessonMode: parsed.data.lessonMode ?? existing.lessonMode,
        unitNumber:
          parsed.data.unitNumber === undefined
            ? existing.unitNumber
            : parsed.data.unitNumber && parsed.data.unitNumber.trim()
              ? parsed.data.unitNumber.trim()
              : null,
        houseNumber: parsed.data.houseNumber ?? existing.houseNumber,
        streetName: parsed.data.streetName ?? existing.streetName,
        streetType: parsed.data.streetType ?? existing.streetType,
        suburb: parsed.data.suburb ?? existing.suburb,
        state: parsed.data.state ?? existing.state,
        postcode: parsed.data.postcode ?? existing.postcode,
        ...(isOwner(admin) ? { primaryTeacherId: nextPrimaryTeacherId } : {}),
        isArchived: isOwner(admin) ? parsed.data.isArchived ?? existing.isArchived : existing.isArchived
      }
    });

    return NextResponse.json({ customer: updated });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to update customer.");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwner(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.customer.findUnique({
      where: { id }
    });
    if (!existing) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    // Archive instead of hard-delete when historical bookings/requests/series still reference this
    // customer so operational history and invoice links remain intact.
    const [bookingLinks, requestLinks, seriesLinks] = await prisma.$transaction([
      prisma.booking.count({ where: { customerId: id } }),
      prisma.bookingRequest.count({ where: { customerId: id } }),
      prisma.bookingSeries.count({ where: { customerId: id } })
    ]);
    const linkedCount = bookingLinks + requestLinks + seriesLinks;

    if (linkedCount > 0) {
      const archived = await prisma.customer.update({
        where: { id },
        data: {
          isArchived: true
        }
      });
      return NextResponse.json({ ok: true, archived: true, linkedCount, customer: archived });
    }

    await prisma.customer.delete({
      where: { id }
    });
    return NextResponse.json({ ok: true, archived: false, linkedCount: 0 });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to delete customer.");
  }
}
