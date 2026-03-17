import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getOwnerEmail, isImapConfigured } from "@/lib/env";
import { isGmailConfigured } from "@/lib/email/gmail-service";
import { syncGmailSentMessages } from "@/lib/gmail/sync";
import { listRecentImapMessagesBySender } from "@/lib/imap/service";
import { logError } from "@/lib/observability";
import { getEmailRecordBodyFields, type EmailRecord, type EmailRefreshResult } from "@/lib/admin/email-history";

type CustomerEmailTarget = {
  id: string;
  email: string;
  normalizedEmail: string;
};

type OutboundEmailRow = Awaited<ReturnType<typeof prisma.outboundEmail.findMany>>[number];
type InboundEmailRow = Awaited<ReturnType<typeof prisma.customerInboundEmail.findMany>>[number];

const STORED_EMAIL_ADDRESS_PATTERN = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractStoredEmailAddresses(value: string): string[] {
  return Array.from(
    value.matchAll(STORED_EMAIL_ADDRESS_PATTERN),
    (match) => normalizeEmail(match[1] || "")
  ).filter(Boolean);
}

function matchesStoredRecipient(toEmail: string, emailValue: string): boolean {
  return extractStoredEmailAddresses(toEmail).includes(normalizeEmail(emailValue));
}

function buildRecipientMatchPattern(emailValue: string): string {
  const escapedEmail = escapeRegExp(normalizeEmail(emailValue));
  return `(^|,\\s*)([^,<>]*<)?${escapedEmail}(>)?(,\\s*|$)`;
}

async function listOutboundEmailsForCustomer(customer: CustomerEmailTarget): Promise<OutboundEmailRow[]> {
  const matchingRowIds = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM \`OutboundEmail\`
    WHERE LOWER(\`toEmail\`) REGEXP ${buildRecipientMatchPattern(customer.normalizedEmail)}
    ORDER BY \`createdAt\` DESC
    LIMIT 50
  `);

  if (matchingRowIds.length === 0) {
    return [];
  }

  const outboundRows = await prisma.outboundEmail.findMany({
    where: {
      id: {
        in: matchingRowIds.map((row) => row.id)
      }
    }
  });
  const orderById = new Map(matchingRowIds.map((row, index) => [row.id, index]));

  return outboundRows
    .filter((row) => matchesStoredRecipient(row.toEmail, customer.normalizedEmail))
    .sort((left, right) => (orderById.get(left.id) || 0) - (orderById.get(right.id) || 0));
}

function getOutboundFromAddress(provider?: string, source?: string): string {
  if (provider === "gmail" || source === "gmail") {
    return process.env.GMAIL_USER_EMAIL || getOwnerEmail() || "System";
  }

  return getOwnerEmail() || process.env.SMTP_FROM || "System";
}

function toEmailRecordFromOutbound(row: OutboundEmailRow): EmailRecord {
  return {
    id: row.id,
    fromEmail: getOutboundFromAddress(row.provider, row.source),
    toEmail: row.toEmail,
    subject: row.subject,
    ...getEmailRecordBodyFields(row.htmlBody),
    status: row.status,
    provider: row.provider,
    source: row.source,
    error: row.error || undefined,
    createdAt: row.createdAt.toISOString(),
    direction: "outbound"
  };
}

function toEmailRecordFromInbound(row: InboundEmailRow): EmailRecord {
  return {
    id: row.id,
    fromEmail: row.fromEmail,
    toEmail: row.toEmail || "",
    subject: row.subject,
    textBody: row.bodyText || row.snippet,
    status: row.status,
    provider: row.provider,
    source: row.source,
    createdAt: row.receivedAt.toISOString(),
    direction: "inbound"
  };
}

/**
 * Returns merged outbound and inbound email history for a customer.
 */
export async function getCustomerEmailHistory(customer: CustomerEmailTarget): Promise<EmailRecord[]> {
  const [outboundRows, inboundRows] = await Promise.all([
    listOutboundEmailsForCustomer(customer),
    prisma.customerInboundEmail.findMany({
      where: {
        customerId: customer.id
      },
      orderBy: {
        receivedAt: "desc"
      },
      take: 50
    })
  ]);

  return [...outboundRows.map(toEmailRecordFromOutbound), ...inboundRows.map(toEmailRecordFromInbound)]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 50);
}

async function syncCustomerImapMessages(customer: CustomerEmailTarget, maxResults: number): Promise<{ importedCount: number; skippedCount: number }> {
  const messages = await listRecentImapMessagesBySender(customer.normalizedEmail, maxResults);
  const matchedMessages = messages.filter((message) => normalizeEmail(message.senderEmail) === customer.normalizedEmail);
  const matchedExternalIds = matchedMessages.map((message) => message.messageId);
  const existingRows =
    matchedExternalIds.length > 0
      ? await prisma.customerInboundEmail.findMany({
          where: {
            customerId: customer.id,
            provider: "imap",
            externalId: {
              in: matchedExternalIds
            }
          },
          select: {
            externalId: true
          }
        })
      : [];
  const existingExternalIds = new Set(existingRows.map((row) => row.externalId));

  let importedCount = 0;
  let skippedCount = 0;
  const updates = [];
  const creates = [];

  for (const message of matchedMessages) {
    if (existingExternalIds.has(message.messageId)) {
      skippedCount += 1;
      updates.push(
        prisma.customerInboundEmail.update({
        where: {
          customerId_provider_externalId: {
            customerId: customer.id,
            provider: "imap",
            externalId: message.messageId
          }
        },
        data: {
          customerId: customer.id,
          fromEmail: message.senderEmail,
          toEmail: message.toEmail || null,
          subject: message.subject,
          snippet: message.snippet,
          bodyText: message.bodyText,
          receivedAt: new Date(message.receivedAt),
          syncedAt: new Date()
        }
      })
      );
      continue;
    }

    creates.push({
      customerId: customer.id,
      provider: "imap" as const,
      source: "imap" as const,
      externalId: message.messageId,
      fromEmail: message.senderEmail,
      toEmail: message.toEmail || null,
      subject: message.subject,
      snippet: message.snippet,
      bodyText: message.bodyText,
      status: "received" as const,
      receivedAt: new Date(message.receivedAt)
    });
    importedCount += 1;
  }

  if (updates.length > 0 || creates.length > 0) {
    await prisma.$transaction([
      ...updates,
      ...(creates.length > 0 ? [prisma.customerInboundEmail.createMany({ data: creates })] : [])
    ]);
  }

  skippedCount += messages.length - matchedMessages.length;

  return {
    importedCount,
    skippedCount
  };
}

/**
 * Refreshes provider-backed email history snapshots for a customer.
 */
export async function refreshCustomerEmailHistory(customer: CustomerEmailTarget, maxResults: number = 20): Promise<EmailRefreshResult> {
  const gmailConfigured = isGmailConfigured();
  const imapConfigured = isImapConfigured();

  if (!gmailConfigured && !imapConfigured) {
    throw new Error("No mailbox providers are configured for email history refresh.");
  }

  const result: EmailRefreshResult = { ok: true };
  const providerErrors: Error[] = [];

  if (gmailConfigured) {
    try {
      result.gmail = await syncGmailSentMessages(maxResults, { targetToEmail: customer.normalizedEmail });
    } catch (error) {
      logError("customer_email_history.gmail_refresh_failed", error, {
        customerId: customer.id,
        customerEmail: customer.normalizedEmail
      });
      providerErrors.push(error instanceof Error ? error : new Error("Gmail customer history refresh failed."));
    }
  }

  if (imapConfigured) {
    try {
      result.imap = await syncCustomerImapMessages(customer, maxResults);
    } catch (error) {
      logError("customer_email_history.imap_refresh_failed", error, {
        customerId: customer.id,
        customerEmail: customer.normalizedEmail
      });
      providerErrors.push(error instanceof Error ? error : new Error("IMAP customer history refresh failed."));
    }
  }

  if (!result.gmail && !result.imap) {
    throw providerErrors[providerErrors.length - 1] || new Error("Email history refresh failed for all configured providers.");
  }

  return result;
}
