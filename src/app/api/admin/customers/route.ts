/**
 * Admin Customers API Route
 * 
 * Provides directory management for student profiles (Customers).
 * Supports paged searching, sorting, and manual creation by administrators.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";

import { isOwner } from "@/lib/admin/permissions";
import { resolveAssignedTeacherId } from "@/lib/admin/teacher-assignment";
import { lessonModeSchema, skillLevelSchema, auPostcodeSchema, auPhoneSchema, auStateSchema } from "@/lib/booking-rules";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { customerSnapshotFromInput, normalizeEmail, normalizePhone } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { ensurePortalCredentialForCustomer } from "@/lib/student-portal/credentials";
import { listCustomersQuerySchema } from "@/lib/customers/schema";

/**
 * Validation schema for manual customer creation.
 */
const createCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: auPhoneSchema,
  skillLevel: skillLevelSchema.default("beginner"),
  lessonMode: lessonModeSchema.default("in_person"),
  unitNumber: z.string().trim().max(20).optional().nullable(),
  houseNumber: z.string().trim().max(20).optional().default(""),
  streetName: z.string().trim().max(120).optional().default(""),
  streetType: z.string().trim().max(40).optional().default(""),
  suburb: z.string().trim().max(80).optional().default(""),
  state: auStateSchema.optional().default("VIC"),
  postcode: auPostcodeSchema.optional().default("3000"),
  primaryTeacherId: z.string().trim().min(1).nullable().optional()
});

/**
 * GET: Lists active customers for admin search/select controls and directory tables.
 * 
 * LOGIC:
 * 1. Parses query parameters (search string 'q', sort options, pagination 'page/pageSize').
 * 2. Builds a Prisma 'where' clause for fuzzy matching names, emails, and phones.
 * 3. Executes count and findMany in a transaction for a consistent paged result.
 * 4. Includes portal credential metadata so the UI can quickly show enrollment status.
 * 
 * @param request - Incoming request with search/paging params
 * @returns Paged customer list with total count
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = listCustomersQuerySchema.safeParse({
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      customerIds: request.nextUrl.searchParams.get("customerIds") ?? undefined,
      sortBy: request.nextUrl.searchParams.get("sortBy") ?? undefined,
      sortDir: request.nextUrl.searchParams.get("sortDir") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? request.nextUrl.searchParams.get("limit") ?? undefined,
      isArchived: request.nextUrl.searchParams.get("isArchived") ?? undefined
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters.", details: parsed.error.flatten() }, { status: 400 });
    }

    const { q, customerIds, sortBy, sortDir, page, pageSize, isArchived } = parsed.data;
    const skip = (page - 1) * pageSize;
    const MAX_CUSTOMER_IDS = 500;
    const customerIdList = customerIds
      ? Array.from(
          new Set(
            customerIds
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean)
          )
        ).slice(0, MAX_CUSTOMER_IDS)
      : [];

    const where: Prisma.CustomerWhereInput = {
      isArchived: isArchived === "true",
      ...(admin.role === "teacher"
        ? {
            primaryTeacherId: admin.id
          }
        : {}),
      ...(customerIdList.length > 0
        ? {
            id: {
              in: customerIdList
            }
          }
        : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } }
            ]
          }
        : {})
    };

    const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
      sortBy === "skill_mode"
        ? [{ skillLevel: sortDir }, { lessonMode: sortDir }, { fullName: "asc" }, { createdAt: "desc" }]
        : [{ fullName: sortDir }, { createdAt: "desc" }];

    // Execute paged queries in parallel
    const [customers, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        orderBy,
        take: pageSize,
        skip,
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
      }),
      prisma.customer.count({ where })
    ]);

    return NextResponse.json({ 
      customers,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load customers.");
  }
}

/**
 * POST: Manually creates a new customer profile.
 * 
 * CONFLICT RESOLUTION:
 * Explicitly checks for existing active customers with matching email/phone 
 * before creation. Returns 409 (Conflict) to prevent accidental duplicates.
 * 
 * RATIONALE: Every customer created via admin also receives a Student Portal 
 * credential automatically, ensuring they are "portal-ready" immediately.
 * 
 * @param request - Customer data payload
 * @returns The newly created customer record
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwner(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid customer payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(parsed.data.email);
    const normalizedPhone = normalizePhone(parsed.data.phone);
    const primaryTeacherId = await resolveAssignedTeacherId({
      db: prisma,
      actor: admin,
      requestedAssignedTeacherId: parsed.data.primaryTeacherId ?? null
    });

    // STEP 1: Duplicate Check
    const existing = await prisma.customer.findFirst({
      where: {
        isArchived: false,
        OR: [{ normalizedEmail }, { normalizedPhone }]
      },
      orderBy: { createdAt: "desc" }
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

    // Keep customer creation and portal enrollment atomic so a credential
    // failure cannot leave behind a "ghost" customer that the UI treats as a
    // failed create and later retries into a duplicate conflict.
    const created = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          ...customerSnapshotFromInput({
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
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
          }),
          ...(primaryTeacherId ? { primaryTeacherId } : {})
        }
      });

      await ensurePortalCredentialForCustomer({
        customerId: customer.id,
        actorId: admin.id,
        tx,
        details: "Portal credential generated during admin customer create."
      });

      return customer;
    });

    return NextResponse.json({ customer: created }, { status: 201 });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to create customer.");
  }
}
