import { prisma } from "@/lib/db";
import { listSentMessages, getMessageDetails } from "./service";
import type { gmail_v1 } from "googleapis";
import { logError, logEvent } from "@/lib/observability";
import { getEmailRecordBodyFields } from "@/lib/admin/email-history";

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

function decodeGmailBodyData(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8").trim();
}

function findBodyByMimeType(part: gmail_v1.Schema$MessagePart | undefined, mimeType: string): string {
  if (!part) {
    return "";
  }

  if (part.mimeType === mimeType && part.body?.data) {
    return decodeGmailBodyData(part.body.data);
  }

  for (const childPart of part.parts || []) {
    const childBody = findBodyByMimeType(childPart, mimeType);
    if (childBody) {
      return childBody;
    }
  }

  return "";
}

function extractBestStoredBody(details: gmail_v1.Schema$Message): string {
  const htmlBody = findBodyByMimeType(details.payload, "text/html");
  if (htmlBody) {
    return htmlBody;
  }

  const textBody = findBodyByMimeType(details.payload, "text/plain");
  if (textBody) {
    return textBody;
  }

  if (details.payload?.body?.data) {
    const payloadBody = decodeGmailBodyData(details.payload.body.data);
    if (payloadBody) {
      return payloadBody;
    }
  }

  return details.snippet?.trim() || "";
}

function getStoredBodyQuality(value?: string | null): number {
  const bodyFields = getEmailRecordBodyFields(value);
  if (bodyFields.htmlBody) {
    return 3;
  }

  if (bodyFields.textBody) {
    return 2;
  }

  return 0;
}

function shouldRepairStoredBody(existingBody: string | null, recoveredBody: string): boolean {
  const normalizedRecoveredBody = recoveredBody.trim();
  if (!normalizedRecoveredBody) {
    return false;
  }

  const existingQuality = getStoredBodyQuality(existingBody);
  const recoveredQuality = getStoredBodyQuality(normalizedRecoveredBody);
  if (recoveredQuality > existingQuality) {
    return true;
  }

  return recoveredQuality === existingQuality && normalizedRecoveredBody.length > (existingBody?.trim().length || 0);
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
      
      const body = extractBestStoredBody(details);

      if (existing) {
        skippedCount++;
        if (existing.toEmail !== storedRecipientValue || shouldRepairStoredBody(existing.htmlBody, body)) {
          await prisma.outboundEmail.update({
            where: { externalId: msg.id },
            data: {
              toEmail: storedRecipientValue,
              ...(shouldRepairStoredBody(existing.htmlBody, body) ? { htmlBody: body } : {})
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
