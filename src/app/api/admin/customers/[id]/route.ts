import { NextRequest, NextResponse } from "next/server";

import { canManagePrimaryTeacherCustomer, isOwner } from "@/lib/admin/permissions";
import { resolveAssignedTeacherId } from "@/lib/admin/teacher-assignment";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { normalizeEmail, normalizePhone } from "@/lib/customer-match";
import { updateCustomerSchema } from "@/lib/customers/schema";
import { prisma } from "@/lib/db";
import { buildNameSearchTokens, normalizeFullNameForLookup } from "@/lib/student-portal/credentials";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/** Address fields the admin dialog marks required, with their form labels. */
const ADDRESS_FIELD_LABELS = {
  houseNumber: "House number",
  streetName: "Street name",
  streetType: "Street type",
  suburb: "Suburb",
  state: "State",
  postcode: "Postcode"
} as const;

/**
 * Rejects an edit that would blank out an address field that currently holds a
 * value.
 *
 * RATIONALE: the dialog PATCHes the whole form, and some legacy customers
 * (CSV imports, early bookings) were stored with empty address parts. Requiring
 * every field outright would make those records unsaveable for unrelated edits
 * like a phone number, so the rule is "you may not erase what is there".
 *
 * @returns Per-field messages for a 400 response, or null when the edit is fine
 */
function findClearedAddressFields(
  patch: Partial<Record<keyof typeof ADDRESS_FIELD_LABELS, string | undefined>>,
  existing: Record<keyof typeof ADDRESS_FIELD_LABELS, string | null>
): Record<string, string[]> | null {
  const fieldErrors: Record<string, string[]> = {};

  for (const field of Object.keys(ADDRESS_FIELD_LABELS) as Array<keyof typeof ADDRESS_FIELD_LABELS>) {
    const incoming = patch[field];
    if (incoming === undefined || incoming.trim() !== "") {
      continue;
    }
    if ((existing[field] ?? "").trim() !== "") {
      fieldErrors[field] = [`${ADDRESS_FIELD_LABELS[field]} is required and cannot be cleared.`];
    }
  }

  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}

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

    const clearedAddressFields = findClearedAddressFields(parsed.data, existing);
    if (clearedAddressFields) {
      return NextResponse.json(
        {
          error: "Invalid customer payload.",
          details: { formErrors: [], fieldErrors: clearedAddressFields }
        },
        { status: 400 }
      );
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
      // SECURITY: the match is looked up across every customer, including ones
      // this admin cannot manage, so the record itself must not be returned —
      // it would let a teacher read another teacher's student by guessing an
      // email or phone. The message is all the UI needs.
      return NextResponse.json(
        { error: "Another customer already uses this email or phone." },
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
