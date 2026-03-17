import { NextRequest, NextResponse } from "next/server";

import { canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { refreshCustomerEmailHistory } from "@/lib/email/history";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * POST: Refreshes provider-backed email history for a single customer.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        primaryTeacherId: true
      }
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await refreshCustomerEmailHistory(customer);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("No mailbox providers are configured")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return jsonUnexpectedError(error, "Unable to refresh email history.");
  }
}
