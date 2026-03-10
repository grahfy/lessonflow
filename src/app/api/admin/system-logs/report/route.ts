import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email/service";
import { z } from "zod";
import { SystemLog } from "@/generated/prisma/client";

const reportBugSchema = z.object({
  description: z.string().min(10),
  logIds: z.array(z.string()).optional(),
  includeRecentLogs: z.boolean().default(true),
});

/**
 * Endpoint to report a bug by emailing selected or recent logs to the developer.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = reportBugSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ 
        error: "Invalid request payload.", 
        details: parsed.error.flatten() 
      }, { status: 400 });
    }

    const { description, logIds, includeRecentLogs } = parsed.data;

    // Fetch relevant logs
    let logsToInclude: SystemLog[] = [];
    if (logIds && logIds.length > 0) {
      logsToInclude = await prisma.systemLog.findMany({
        where: { id: { in: logIds } },
        orderBy: { createdAt: "desc" }
      });
    } else if (includeRecentLogs) {
      logsToInclude = await prisma.systemLog.findMany({
        take: 50,
        orderBy: { createdAt: "desc" }
      });
    }

    const logContext = logsToInclude.map(log => 
      `[${log.createdAt.toISOString()}] [${log.level}] ${log.event}\n${log.message}\nMeta: ${JSON.stringify(log.meta)}`
    ).join("\n\n---\n\n");

    const htmlBody = `
      <h1>Bug Report from LessonFlow Admin</h1>
      <p><strong>Reporter:</strong> ${admin.displayName} (${admin.email})</p>
      <p><strong>Description:</strong></p>
      <div style="background: #f4f4f4; padding: 15px; border-radius: 4px; white-space: pre-wrap;">
        ${description}
      </div>
      
      <h2>Log Context</h2>
      <pre style="background: #eee; padding: 10px; font-size: 12px; border: 1px solid #ccc; overflow: auto;">
${logContext || "No logs included."}
      </pre>
    `;

    const result = await sendEmail({
      to: "contact@grahfmusic.com",
      subject: `[LessonFlow Bug Report] from ${admin.displayName}`,
      html: htmlBody,
    });

    if (result.status === "failed") {
      return NextResponse.json({ error: "Failed to send email report.", details: result.error }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      status: result.status 
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to submit bug report.");
  }
}
