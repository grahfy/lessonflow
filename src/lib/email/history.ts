import { prisma } from "@/lib/db";
import { getOwnerEmail, isImapConfigured } from "@/lib/env";
import { isGmailConfigured } from "@/lib/email/gmail-service";
import { syncGmailSentMessages } from "@/lib/gmail/sync";
import { listRecentImapMessages } from "@/lib/imap/service";
import { logError } from "@/lib/observability";
import { type EmailRecord, type EmailRefreshResult } from "@/lib/admin/email-history";

type CustomerEmailTarget = {
  id: string;
  email: string;
  normalizedEmail: string;
};

type OutboundEmailRow = Awaited<ReturnType<typeof prisma.outboundEmail.findMany>>[number];
type InboundEmailRow = Awaited<ReturnType<typeof prisma.customerInboundEmail.findMany>>[number];

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function matchesEmailAddress(emailValue: string) {
  const normalizedEmail = normalizeEmail(emailValue);
  return {
    OR: [
      { toEmail: normalizedEmail },
      { toEmail: { contains: normalizedEmail } }
    ]
  };
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
    htmlBody: row.htmlBody,
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
    prisma.outboundEmail.findMany({
      where: matchesEmailAddress(customer.email),
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    }),
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
  const messages = await listRecentImapMessages(maxResults);
  const matchedMessages = messages.filter((message) => normalizeEmail(message.senderEmail) === customer.normalizedEmail);

  let importedCount = 0;
  let skippedCount = 0;

  for (const message of matchedMessages) {
    const existing = await prisma.customerInboundEmail.findUnique({
      where: {
        provider_externalId: {
          provider: "imap",
          externalId: message.messageId
        }
      }
    });

    if (existing) {
      skippedCount += 1;
      await prisma.customerInboundEmail.update({
        where: {
          provider_externalId: {
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
      });
      continue;
    }

    await prisma.customerInboundEmail.create({
      data: {
        customerId: customer.id,
        provider: "imap",
        source: "imap",
        externalId: message.messageId,
        fromEmail: message.senderEmail,
        toEmail: message.toEmail || null,
        subject: message.subject,
        snippet: message.snippet,
        bodyText: message.bodyText,
        status: "received",
        receivedAt: new Date(message.receivedAt)
      }
    });
    importedCount += 1;
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
