import { prisma } from "@/lib/db";
import { listSentMessages, getMessageDetails } from "./service";
import type { gmail_v1 } from "googleapis";
import { logError, logEvent } from "@/lib/observability";
import { type GmailRefreshSummary, getEmailRecordBodyFields } from "@/lib/admin/email-history";
import { GMAIL_REQUIRED_SCOPES } from "@/lib/gmail/scopes";

const HEADER_EMAIL_PATTERN = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;

type GmailSyncContext = {
  degradedReadAccess: boolean;
};

type GmailSyncResult = Pick<GmailRefreshSummary, "importedCount" | "skippedCount">;

type SyncedSentMessageResult = GmailSyncResult & {
  matchedTarget: boolean;
};

const GMAIL_DEGRADED_WARNING =
  "Gmail sync is running with metadata-only access. Reauthorize Gmail with send + readonly scopes, then refresh history again to recover full message bodies.";

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

function isMetadataReadRestriction(error: unknown): boolean {
  const err = error as { code?: number; status?: number; message?: string };
  return err.code === 403 || err.status === 403 || err.message?.includes("Metadata scope") === true;
}

function isMetadataQueryRestriction(error: unknown): boolean {
  const err = error as { message?: string };
  return err.message?.includes("Metadata scope") === true && err.message?.includes("'q' parameter") === true;
}

async function getMessageDetailsWithFallback(messageId: string, context: GmailSyncContext): Promise<gmail_v1.Schema$Message> {
  try {
    return await getMessageDetails(messageId, "full");
  } catch (error: unknown) {
    if (!isMetadataReadRestriction(error)) {
      throw error;
    }

    logEvent("gmail.sync_metadata_read_fallback", {
      messageId,
      requiredScopes: GMAIL_REQUIRED_SCOPES
    });
    context.degradedReadAccess = true;

    // NOTE: metadata format omits body content (parts/body.data not populated).
    // extractBestStoredBody will fall back to details.snippet (~100 chars).
    // If this 403 persists because the stored refresh token only has
    // `gmail.metadata`-level access, this message will be stored with
    // snippet-only content until the integration is reauthorized with the
    // scopes listed in `GMAIL_REQUIRED_SCOPES`.
    return getMessageDetails(messageId, "metadata");
  }
}

async function syncSentMessage(
  messageId: string,
  targetToEmail: string | undefined,
  context: GmailSyncContext
): Promise<SyncedSentMessageResult> {
  const details = await getMessageDetailsWithFallback(messageId, context);
  const headers = details.payload?.headers || [];
  const toHeader = headers.find((header) => header.name?.toLowerCase() === "to")?.value || "unknown";
  const subjectHeader = headers.find((header) => header.name?.toLowerCase() === "subject")?.value || "(no subject)";
  const normalizedRecipients = extractEmailAddresses(toHeader);
  const storedRecipientValue = getStoredRecipientValue(toHeader, normalizedRecipients);

  if (targetToEmail && !normalizedRecipients.includes(targetToEmail)) {
    return {
      matchedTarget: false,
      importedCount: 0,
      skippedCount: 0
    };
  }

  const existing = await prisma.outboundEmail.findUnique({
    where: { externalId: messageId },
  });

  const body = extractBestStoredBody(details);

  if (existing) {
    const repairBody = shouldRepairStoredBody(existing.htmlBody, body);
    if (existing.toEmail !== storedRecipientValue || repairBody) {
      await prisma.outboundEmail.update({
        where: { externalId: messageId },
        data: {
          toEmail: storedRecipientValue,
          ...(repairBody ? { htmlBody: body } : {})
        }
      });
    }

    return {
      matchedTarget: true,
      importedCount: 0,
      skippedCount: 1
    };
  }

  await prisma.outboundEmail.create({
    data: {
      toEmail: storedRecipientValue,
      subject: subjectHeader,
      htmlBody: body,
      status: "sent",
      provider: "gmail",
      externalId: messageId,
      source: "gmail", // Mark as originated from Gmail interface
      createdAt: new Date(parseInt(details.internalDate || Date.now().toString(), 10)),
    },
  });

  return {
    matchedTarget: true,
    importedCount: 1,
    skippedCount: 0
  };
}

async function syncSentMessagesBatch(
  messages: gmail_v1.Schema$Message[],
  options?: { targetToEmail?: string; maxMatchedMessages?: number; context: GmailSyncContext }
): Promise<GmailSyncResult & { matchedCount: number }> {
  const targetToEmail = options?.targetToEmail;
  const maxMatchedMessages = options?.maxMatchedMessages ?? Number.POSITIVE_INFINITY;
  const context = options?.context ?? { degradedReadAccess: false };
  let importedCount = 0;
  let skippedCount = 0;
  let matchedCount = 0;

  for (const message of messages) {
    if (matchedCount >= maxMatchedMessages) {
      break;
    }

    if (!message.id) {
      continue;
    }

    const result = await syncSentMessage(message.id, targetToEmail, context);
    if (!result.matchedTarget) {
      continue;
    }

    matchedCount += 1;
    importedCount += result.importedCount;
    skippedCount += result.skippedCount;
  }

  return { importedCount, skippedCount, matchedCount };
}

async function syncTargetedSentMessages(
  maxResults: number,
  targetToEmail: string,
  context: GmailSyncContext
): Promise<GmailSyncResult> {
  try {
    const { messages } = await listSentMessages(maxResults, undefined, `to:${targetToEmail}`);
    const result = await syncSentMessagesBatch(messages, { targetToEmail, maxMatchedMessages: maxResults, context });
    return {
      importedCount: result.importedCount,
      skippedCount: result.skippedCount
    };
  } catch (error) {
    if (!isMetadataQueryRestriction(error)) {
      throw error;
    }

    logEvent("gmail.sync_target_query_fallback", {
      maxResults,
      targetToEmail,
      requiredScopes: GMAIL_REQUIRED_SCOPES
    });
    context.degradedReadAccess = true;

    const pageSize = Math.min(Math.max(maxResults, 20), 100);
    let importedCount = 0;
    let skippedCount = 0;
    let matchedCount = 0;
    let nextPageToken: string | undefined;

    do {
      const response = await listSentMessages(pageSize, nextPageToken);
      const result = await syncSentMessagesBatch(response.messages, {
        targetToEmail,
        maxMatchedMessages: maxResults - matchedCount,
        context
      });

      importedCount += result.importedCount;
      skippedCount += result.skippedCount;
      matchedCount += result.matchedCount;
      nextPageToken = response.nextPageToken || undefined;
    } while (nextPageToken && matchedCount < maxResults);

    return { importedCount, skippedCount };
  }
}

/**
 * Syncs the latest sent messages from Gmail into the local OutboundEmail table.
 * Deduplicates based on the Gmail message ID (externalId).
 */
export async function syncGmailSentMessages(maxResults: number = 50, options?: { targetToEmail?: string }) {
  try {
    const targetToEmail = options?.targetToEmail?.trim().toLowerCase() || undefined;
    const context: GmailSyncContext = { degradedReadAccess: false };
    logEvent("gmail.sync_started", { maxResults, targetToEmail });
    let result: GmailSyncResult;

    if (targetToEmail) {
      result = await syncTargetedSentMessages(maxResults, targetToEmail, context);
    } else {
      const { messages } = await listSentMessages(maxResults);
      const batchResult = await syncSentMessagesBatch(messages, { context });
      result = {
        importedCount: batchResult.importedCount,
        skippedCount: batchResult.skippedCount
      };
    }

    const { importedCount, skippedCount } = result;
    logEvent("gmail.sync_completed", {
      importedCount,
      skippedCount,
      degradedReadAccess: context.degradedReadAccess
    });

    return {
      importedCount,
      skippedCount,
      ...(context.degradedReadAccess
        ? {
            degradedReadAccess: true,
            warning: GMAIL_DEGRADED_WARNING
          }
        : {})
    };
  } catch (error) {
    logError("gmail.sync_failed", error);
    throw error;
  }
}
