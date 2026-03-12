import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { z } from "zod";

const listLogsQuerySchema = z.object({
  level: z.string().optional(),
  event: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
});

/**
 * Lists system logs with filtering and pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = listLogsQuerySchema.safeParse(searchParams);
    
    if (!parsed.success) {
      return NextResponse.json({ 
        error: "Invalid query parameters.", 
        details: parsed.error.flatten() 
      }, { status: 400 });
    }

    const { level, event, page, pageSize } = parsed.data;

    const where: Prisma.SystemLogWhereInput = {};
    
    if (level) {
      where.level = level;
    }
    
    if (event) {
      where.event = { contains: event };
    }

    const skip = (page - 1) * pageSize;

    const [logs, total] = await prisma.$transaction([
      prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize
      }),
      prisma.systemLog.count({ where })
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load system logs.");
  }
}
