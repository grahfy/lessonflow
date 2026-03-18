import { NextRequest, NextResponse } from "next/server";
import { isOwnerAdmin } from "@/lib/admin-auth";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email/service";
import { z } from "zod";
import { SystemLog } from "@/generated/prisma/client";

const reportBugSchema = z.object({
  subject: z.string().min(3).max(200),
  replyEmail: z.string().email().optional(),
  description: z.string().min(10),
  screenshot: z.string().optional(),
  logIds: z.array(z.string()).optional(),
  includeRecentLogs: z.boolean().default(true),
});

/**
 * Endpoint to report a bug by emailing selected or recent logs to the developer.
 * Accepts an optional subject line, description, screenshot (base64 data URL),
 * and either specific log IDs or a flag to include the most recent 50 logs.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerAdmin(admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = reportBugSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ 
        error: "Invalid request payload.", 
        details: parsed.error.flatten() 
      }, { status: 400 });
    }

    const { subject, replyEmail, description, screenshot, logIds, includeRecentLogs } = parsed.data;

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

    // Build screenshot HTML block if provided
    const screenshotHtml = screenshot
      ? `<h2>Screenshot</h2><p><img src="${screenshot}" alt="Bug report screenshot" style="max-width: 100%; border: 1px solid #ccc; border-radius: 4px;" /></p>`
      : "";

    const htmlBody = `
      <h1>Bug Report: ${subject}</h1>
      <p><strong>Reporter:</strong> ${admin.displayName} (${admin.email})</p>
      ${replyEmail ? `<p><strong>Reply To:</strong> ${replyEmail}</p>` : ""}
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Description:</strong></p>
      <div style="background: #f4f4f4; padding: 15px; border-radius: 4px; white-space: pre-wrap;">
        ${description}
      </div>
      
      ${screenshotHtml}

      <h2>Log Context</h2>
      <pre style="background: #eee; padding: 10px; font-size: 12px; border: 1px solid #ccc; overflow: auto;">
${logContext || "No logs included."}
      </pre>
    `;

    const result = await sendEmail({
      to: "contact@grahfmusic.com",
      cc: "deant@ccasoftware.com.au",
      subject: `[LessonFlow Bug] ${subject} — from ${admin.displayName}`,
      html: htmlBody,
      notification: {
        triggerMode: "manual"
      }
    });

    if (result.status === "queued_no_smtp") {
      return NextResponse.json(
        {
          error: "Bug report email is not configured on this host. Configure a live email provider before submitting issue reports."
        },
        { status: 503 }
      );
    }

    if (result.status === "failed") {
      return NextResponse.json({ error: "Failed to send email report.", details: result.error }, { status: 502 });
    }

    return NextResponse.json({ 
      ok: true, 
      status: result.status 
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to submit bug report.");
  }
}
