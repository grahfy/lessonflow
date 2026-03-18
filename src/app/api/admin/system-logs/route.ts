import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE, dateTimeLocalToDate } from "@/lib/time";

const listLogsQuerySchema = z.object({
  level: z.string().trim().optional(),
  event: z.string().trim().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  download: z.enum(["true", "false"]).optional()
});

const clearLogsSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("all")
  }),
  z.object({
    mode: z.literal("before"),
    cutoffLocal: z.string().min(1)
  })
]);

function buildLogsWhere(level?: string, event?: string): Prisma.SystemLogWhereInput {
  const where: Prisma.SystemLogWhereInput = {};

  if (level) {
    where.level = level;
  }

  if (event) {
    where.event = {
      contains: event
    };
  }

  return where;
}

function formatLogLine(log: {
  createdAt: Date;
  level: string;
  event: string;
  message: string;
  meta: Prisma.JsonValue | null;
}) {
  const metaText = log.meta ? `\nMeta: ${JSON.stringify(log.meta)}` : "";
  return `[${log.createdAt.toISOString()}] [${log.level}] ${log.event}\n${log.message}${metaText}`;
}

async function requireOwner(request: NextRequest) {
  const admin = await requireAdminFromRequest(request);
  if (!admin) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isOwnerAdmin(admin)) {
    return { errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { admin };
}

/**
 * Lists system logs with filtering/pagination and supports filtered export.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = listLogsQuerySchema.safeParse(searchParams);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { level, event, page, pageSize, download } = parsed.data;
    const where = buildLogsWhere(level, event);

    if (download === "true") {
      const logs = await prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: "desc" }
      });

      const body = logs.length > 0
        ? logs.map(formatLogLine).join("\n\n---\n\n")
        : "No logs matched the current filters.";

      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="system-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt"`
        }
      });
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

/**
 * Deletes either all logs or every log up to an app-timezone cutoff.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const body = await request.json().catch(() => null);
    const parsed = clearLogsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid clear logs payload.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.mode === "all") {
      const result = await prisma.systemLog.deleteMany();
      return NextResponse.json({
        ok: true,
        deletedCount: result.count,
        mode: "all"
      });
    }

    const cutoffDate = dateTimeLocalToDate(parsed.data.cutoffLocal, APP_TIMEZONE);
    if (!cutoffDate) {
      return NextResponse.json(
        { error: `Enter a valid cutoff date and time in ${APP_TIMEZONE}.` },
        { status: 400 }
      );
    }

    const result = await prisma.systemLog.deleteMany({
      where: {
        createdAt: {
          lte: cutoffDate
        }
      }
    });

    return NextResponse.json({
      ok: true,
      deletedCount: result.count,
      mode: "before",
      cutoffIso: cutoffDate.toISOString()
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to clear system logs.");
  }
}
