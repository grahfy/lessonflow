import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { lessonModeSchema, skillLevelSchema, auPostcodeSchema, auPhoneSchema, auStateSchema } from "@/lib/booking-rules";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { customerSnapshotFromInput, normalizeEmail, normalizePhone } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { ensurePortalCredentialForCustomer } from "@/lib/student-portal/credentials";

const createCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: auPhoneSchema,
  skillLevel: skillLevelSchema.default("beginner"),
  lessonMode: lessonModeSchema.default("in_person"),
  unitNumber: z.string().trim().regex(/^\d{1,5}$/).optional().nullable(),
  houseNumber: z.string().trim().regex(/^\d{1,5}$/).optional(),
  streetName: z.string().trim().max(120).optional(),
  streetType: z.string().trim().max(40).optional(),
  suburb: z.string().trim().max(80).optional(),
  state: auStateSchema.optional(),
  postcode: auPostcodeSchema.optional()
});

/**
 * Lists active customers for admin search/select controls and customer directory dialogs.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const limitRaw = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 250) : 100;

    // Include portal credential metadata so the admin UI can show/reveal/regenerate state without
    // making a second request per customer row.
    const customers = await prisma.customer.findMany({
      where: {
        isArchived: false,
        ...(query
          ? {
              OR: [
                { fullName: { contains: query } },
                { email: { contains: query } },
                { phone: { contains: query } }
              ]
            }
          : {})
      },
      orderBy: [{ fullName: "asc" }, { createdAt: "desc" }],
      take: limit,
      include: {
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

    return NextResponse.json({ customers });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load customers.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid customer payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(parsed.data.email);
    const normalizedPhone = normalizePhone(parsed.data.phone);

    // Email/phone uniqueness is enforced at the workflow level to support a friendlier conflict
    // response than a raw DB constraint error.
    const existing = await prisma.customer.findFirst({
      where: {
        isArchived: false,
        OR: [{ normalizedEmail }, { normalizedPhone }]
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "A customer with this email or phone already exists.",
          customer: existing
        },
        { status: 409 }
      );
    }

    const created = await prisma.customer.create({
      data: customerSnapshotFromInput({
        name: parsed.data.fullName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        skillLevel: parsed.data.skillLevel,
        lessonMode: parsed.data.lessonMode,
        unitNumber: parsed.data.unitNumber ?? undefined,
        houseNumber: parsed.data.houseNumber ?? "",
        streetName: parsed.data.streetName ?? "",
        streetType: parsed.data.streetType ?? "",
        suburb: parsed.data.suburb ?? "",
        state: parsed.data.state ?? "VIC",
        postcode: parsed.data.postcode ?? ""
      })
    });
    // Pre-generate portal credentials so new admin-created customers can access the student portal
    // immediately when support shares details later.
    await ensurePortalCredentialForCustomer({
      customerId: created.id,
      actorId: admin.id,
      details: "Portal credential generated during admin customer create."
    });

    return NextResponse.json({ customer: created }, { status: 201 });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to create customer.");
  }
}
