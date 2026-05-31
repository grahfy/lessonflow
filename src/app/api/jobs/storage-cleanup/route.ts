import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { hasCronSecret } from "@/lib/env";
import { processStorageCleanupTasks } from "@/lib/storage-cleanup";

const requestSchema = z.object({
  maxTasks: z.number().int().min(1).max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!hasCronSecret()) {
      return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
    }

    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid cleanup payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await processStorageCleanupTasks({
      db: prisma,
      maxTasks: parsed.data.maxTasks,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to process storage cleanup tasks.");
  }
}
