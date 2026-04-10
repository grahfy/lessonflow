import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { normalizeEmail, normalizePhone } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { jsonUnexpectedError } from "@/lib/api-errors";
import {
  buildNameSearchTokens,
  normalizeFullNameForLookup,
} from "@/lib/student-portal/credentials";

const querySchema = z.object({
  customerId: z.string().trim().min(1).optional(),
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  postcode: z.string().trim().max(4).optional(),
});

type MatchStatus = "linked" | "exact_match" | "possible_match" | "no_match";

function toCustomerSummary(customer: {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  unitNumber: string | null;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  postcode: string;
  skillLevel: "beginner" | "intermediate" | "advanced";
  lessonMode: "in_person" | "video";
  primaryTeacherId: string | null;
}) {
  return {
    id: customer.id,
    fullName: customer.fullName,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    unitNumber: customer.unitNumber,
    houseNumber: customer.houseNumber,
    streetName: customer.streetName,
    streetType: customer.streetType,
    suburb: customer.suburb,
    state: customer.state,
    postcode: customer.postcode,
    skillLevel: customer.skillLevel,
    lessonMode: customer.lessonMode,
    primaryTeacherId: customer.primaryTeacherId,
  };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = querySchema.safeParse({
      customerId: request.nextUrl.searchParams.get("customerId") ?? undefined,
      firstName: request.nextUrl.searchParams.get("firstName") ?? undefined,
      lastName: request.nextUrl.searchParams.get("lastName") ?? undefined,
      email: request.nextUrl.searchParams.get("email") ?? undefined,
      phone: request.nextUrl.searchParams.get("phone") ?? undefined,
      postcode: request.nextUrl.searchParams.get("postcode") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid lookup query.", details: parsed.error.flatten() }, { status: 400 });
    }

    const whereScope = {
      isArchived: false,
      ...(admin.role === "teacher" ? { primaryTeacherId: admin.id } : {}),
    };

    if (parsed.data.customerId) {
      const linked = await prisma.customer.findFirst({
        where: {
          ...whereScope,
          id: parsed.data.customerId,
        },
      });

      if (linked) {
        return NextResponse.json({
          status: "linked" satisfies MatchStatus,
          customers: [toCustomerSummary(linked)],
        });
      }
    }

    const normalizedEmail = parsed.data.email ? normalizeEmail(parsed.data.email) : "";
    const normalizedPhone = parsed.data.phone ? normalizePhone(parsed.data.phone) : "";

    if (normalizedEmail || normalizedPhone) {
      const exactMatches = await prisma.customer.findMany({
        where: {
          ...whereScope,
          OR: [
            ...(normalizedEmail ? [{ normalizedEmail }] : []),
            ...(normalizedPhone ? [{ normalizedPhone }] : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });

      if (exactMatches.length > 0) {
        return NextResponse.json({
          status: "exact_match" satisfies MatchStatus,
          customers: exactMatches.map(toCustomerSummary),
        });
      }
    }

    const fullName = `${parsed.data.firstName ?? ""} ${parsed.data.lastName ?? ""}`.trim();
    const normalizedFullName = normalizeFullNameForLookup(fullName);
    const nameTokens = buildNameSearchTokens(fullName)?.split(" ").filter(Boolean) ?? [];

    if (normalizedFullName || nameTokens.length > 0) {
      const possibleMatches = await prisma.customer.findMany({
        where: {
          ...whereScope,
          ...(parsed.data.postcode ? { postcode: parsed.data.postcode } : {}),
          OR: [
            ...(normalizedFullName ? [{ normalizedFullName: { contains: normalizedFullName } }] : []),
            ...nameTokens.map((token) => ({ nameSearchTokens: { contains: token } })),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });

      if (possibleMatches.length > 0) {
        return NextResponse.json({
          status: "possible_match" satisfies MatchStatus,
          customers: possibleMatches.map(toCustomerSummary),
        });
      }
    }

    return NextResponse.json({
      status: "no_match" satisfies MatchStatus,
      customers: [],
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to search customers.");
  }
}
