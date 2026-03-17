import { prisma } from "@/lib/db";
import { listSentMessages, getMessageDetails } from "./service";
import type { gmail_v1 } from "googleapis";
import { logError, logEvent } from "@/lib/observability";

const HEADER_EMAIL_PATTERN = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;

function extractEmailAddresses(headerValue: string): string[] {
  return Array.from(headerValue.matchAll(HEADER_EMAIL_PATTERN), (match) => match[1].trim().toLowerCase());
}

function getStoredRecipientValue(toHeader: string, normalizedRecipients: string[]): string {
  if (normalizedRecipients.length > 0) {
    return normalizedRecipients.join(", ");
  }

  return toHeader.trim().toLowerCase() || "unknown";
}

/**
 * Syncs the latest sent messages from Gmail into the local OutboundEmail table.
 * Deduplicates based on the Gmail message ID (externalId).
 */
export async function syncGmailSentMessages(maxResults: number = 50, options?: { targetToEmail?: string }) {
  try {
    const targetToEmail = options?.targetToEmail?.trim().toLowerCase() || undefined;
    logEvent("gmail.sync_started", { maxResults, targetToEmail });
    const query = targetToEmail ? `to:${targetToEmail}` : undefined;
    const { messages } = await listSentMessages(maxResults, undefined, query);
    
    let importedCount = 0;
    let skippedCount = 0;

    for (const msg of messages) {
      if (!msg.id) continue;

      // 1. Fetch details. Try for full content, fallback to metadata if permissions are restricted.
      let details: gmail_v1.Schema$Message | undefined;
      try {
        details = await getMessageDetails(msg.id, "full");
      } catch (error: unknown) {
        const err = error as { code?: number; status?: number; message?: string };
        if (err.code === 403 || err.status === 403 || err.message?.includes("Metadata scope")) {
          details = await getMessageDetails(msg.id, "metadata");
        } else {
          throw error;
        }
      }
      
      // 3. Extract metadata from headers
      const headers = details.payload?.headers || [];
      const toHeader = headers.find(h => h.name?.toLowerCase() === "to")?.value || "unknown";
      const subjectHeader = headers.find(h => h.name?.toLowerCase() === "subject")?.value || "(no subject)";
      const normalizedRecipients = extractEmailAddresses(toHeader);
      const storedRecipientValue = getStoredRecipientValue(toHeader, normalizedRecipients);

      if (targetToEmail && !normalizedRecipients.includes(targetToEmail)) {
        skippedCount++;
        continue;
      }

      // 2. Check if we already have this message and heal recipient storage if needed.
      const existing = await prisma.outboundEmail.findUnique({
        where: { externalId: msg.id },
      });
      
      // 3. Try to get HTML body, fallback to text, then snippet
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

      if (existing) {
        skippedCount++;
        if (existing.toEmail !== storedRecipientValue) {
          await prisma.outboundEmail.update({
            where: { externalId: msg.id },
            data: {
              toEmail: storedRecipientValue
            }
          });
        }
        continue;
      }

      // 4. Create local record
      await prisma.outboundEmail.create({
        data: {
          toEmail: storedRecipientValue,
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
