import { prisma } from "@/lib/db";
import { listSentMessages, getMessageDetails } from "./service";
import { logError, logEvent } from "@/lib/observability";

/**
 * Syncs the latest sent messages from Gmail into the local OutboundEmail table.
 * Deduplicates based on the Gmail message ID (externalId).
 */
export async function syncGmailSentMessages(maxResults: number = 50) {
  try {
    logEvent("gmail.sync_started", { maxResults });
    const { messages } = await listSentMessages(maxResults);
    
    let importedCount = 0;
    let skippedCount = 0;

    for (const msg of messages) {
      if (!msg.id) continue;

      // 1. Check if we already have this message
      const existing = await prisma.outboundEmail.findUnique({
        where: { externalId: msg.id },
      });

      if (existing) {
        skippedCount++;
        continue;
      }

      // 2. Fetch details. Try for full content, fallback to metadata if permissions are restricted.
      let details;
      try {
        details = await getMessageDetails(msg.id, "full");
      } catch (error: any) {
        // If we only have gmail.metadata scope, "full" will fail with 403 or a specific error message.
        // The reported error "Metadata scope does not support 'q' parameter" suggests metadata scope is active.
        if (error.code === 403 || error.status === 403 || error.message?.includes("Metadata scope")) {
          details = await getMessageDetails(msg.id, "metadata");
        } else {
          throw error;
        }
      }
      
      // 3. Extract metadata from headers
      const headers = details.payload?.headers || [];
      const toHeader = headers.find(h => h.name?.toLowerCase() === "to")?.value || "unknown";
      const subjectHeader = headers.find(h => h.name?.toLowerCase() === "subject")?.value || "(no subject)";
      
      // 4. Try to get HTML body, fallback to text, then snippet
      let body = details.snippet || "";
      
      // Gmail messages can be deeply nested. This is a simplified extractor.
      const parts = details.payload?.parts || [];
      const htmlPart = parts.find(p => p.mimeType === "text/html");
      const textPart = parts.find(p => p.mimeType === "text/plain");
      
      if (htmlPart?.body?.data) {
        body = Buffer.from(htmlPart.body.data, "base64").toString("utf-8");
      } else if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      }

      // 5. Create local record
      await prisma.outboundEmail.create({
        data: {
          toEmail: toHeader,
          subject: subjectHeader,
          htmlBody: body,
          status: "sent",
          provider: "gmail",
          externalId: msg.id,
          source: "gmail", // Mark as originated from Gmail interface
          createdAt: new Date(parseInt(details.internalDate || Date.now().toString())),
        },
      });

      importedCount++;
    }

    logEvent("gmail.sync_completed", { importedCount, skippedCount });
    return { importedCount, skippedCount };
  } catch (error) {
    logError("gmail.sync_failed", error);
    throw error;
  }
}
