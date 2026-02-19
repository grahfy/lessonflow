import { NextRequest, NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(request: NextRequest, { params }: Params) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const now = new Date();

  await prisma.booking.updateMany({
    where: {
      seriesId: id,
      startAt: {
        gte: now
      }
    },
    data: {
      status: "cancelled",
      cancelledAt: now,
      modifiedById: admin.id
    }
  });

  await prisma.bookingSeries.update({
    where: { id },
    data: {
      isActive: false
    }
  });

  await prisma.bookingAuditLog.create({
    data: {
      actorId: admin.id,
      action: "series_removed",
      details: `Series ${id} removed from ${now.toISOString()}`
    }
  });

  return NextResponse.json({ ok: true });
}
