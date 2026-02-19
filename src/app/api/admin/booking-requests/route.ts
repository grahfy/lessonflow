import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.bookingRequest.findMany({
    where: {
      status: "pending"
    },
    orderBy: {
      requestedStartAt: "asc"
    }
  });

  return NextResponse.json({ rows });
}
