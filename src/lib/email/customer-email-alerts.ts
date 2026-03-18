import { z } from "zod";

import type {
  CustomerEmailAlertCustomer,
  CustomerEmailAlertMessage,
  CustomerEmailAlertProvider,
  CustomerEmailAlertsSummary
} from "@/lib/admin/customer-email-alerts";
import { normalizeEmail } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { isGmailConfigured } from "@/lib/email/gmail-service";
import {
  getAdminCustomerEmailAlertsProvider,
  type CustomerEmailAlertsProvider,
  isImapConfigured
} from "@/lib/env";
import { listUnreadInboxMessages, getMessageDetails } from "@/lib/gmail/service";
import { getImapConnectionStatus } from "@/lib/imap/service";
import { logError, logEvent } from "@/lib/observability";

const GMAIL_ALERT_BATCH_SIZE = 20;
const HEADER_EMAIL_PATTERN = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;

type AlertProviderStatus = {
  status: "connected" | "not_configured" | "error";
  message: string;
  email?: string;
  mailbox?: string;
};

export type CustomerEmailAlertsStatusSummary = {
  alertsEnabled: boolean;
  providerPreference: CustomerEmailAlertsProvider;
  activeProvider: CustomerEmailAlertProvider;
  gmail: AlertProviderStatus;
  imap: AlertProviderStatus;
};

type ProviderMessage = {
  messageId: string;
  senderEmail: string;
  subject: string;
  snippet: string;
  receivedAt: string;
};

function emptySummary(state: CustomerEmailAlertsSummary["state"], provider: CustomerEmailAlertProvider = null): CustomerEmailAlertsSummary {
  return {
    state,
    provider,
    unreadCount: 0,
    matchedCustomers: [],
    messages: [],
    checkedAt: new Date().toISOString()
  };
}

function parseSenderEmail(fromHeader: string): string | null {
  const matchedEmail = fromHeader.match(HEADER_EMAIL_PATTERN)?.[1];
  if (!matchedEmail) {
    return null;
  }

  const parsed = z.string().email().safeParse(matchedEmail);
  if (!parsed.success) {
    return null;
  }

  return normalizeEmail(parsed.data);
}

function parseReceivedAt(dateHeader: string | undefined, fallbackTimestamp: string | undefined): string {
  const dateCandidate = dateHeader ? new Date(dateHeader) : null;
  if (dateCandidate && !Number.isNaN(dateCandidate.getTime())) {
    return dateCandidate.toISOString();
  }

  if (fallbackTimestamp) {
    const timestampDate = new Date(Number(fallbackTimestamp));
    if (!Number.isNaN(timestampDate.getTime())) {
      return timestampDate.toISOString();
    }
  }

  return new Date().toISOString();
}

function resolveProviderAttempts(): Array<Exclude<CustomerEmailAlertProvider, null>> {
  const gmailConfigured = isGmailConfigured();
  return gmailConfigured ? ["gmail"] : [];
}

async function listUnreadProviderMessages(provider: Exclude<CustomerEmailAlertProvider, null>): Promise<ProviderMessage[]> {
  return listUnreadGmailMessages();
}

function resolveActiveProviderFromStatuses(
  providerPreference: CustomerEmailAlertsProvider,
  gmail: AlertProviderStatus,
  _imap: AlertProviderStatus
): CustomerEmailAlertProvider {
  if (providerPreference === "gmail" && gmail.status === "connected") {
    return "gmail";
  }

  return null;
}

async function listUnreadGmailMessages(): Promise<ProviderMessage[]> {
  const { messages } = await listUnreadInboxMessages(GMAIL_ALERT_BATCH_SIZE);
  const messageIds = messages
    .map((message) => message.id)
    .filter((messageId): messageId is string => Boolean(messageId));

  if (messageIds.length === 0) {
    return [];
  }

  const detailedMessages = (
    await Promise.all(
      messageIds.map(async (messageId) => {
        try {
          return await getMessageDetails(messageId, "metadata", {
            metadataHeaders: ["From", "Subject", "Date"]
          });
        } catch (error) {
          logError("gmail.customer_email_alert_details_failed", error, { messageId });
          return null;
        }
      })
    )
  ).filter((message): message is NonNullable<typeof message> => Boolean(message));

  return detailedMessages
    .map((message) => {
      const headers = message.payload?.headers || [];
      const fromHeader = headers.find((header) => header.name?.toLowerCase() === "from")?.value || "";
      const subjectHeader = headers.find((header) => header.name?.toLowerCase() === "subject")?.value || "(no subject)";
      const dateHeader = headers.find((header) => header.name?.toLowerCase() === "date")?.value;
      const senderEmail = parseSenderEmail(fromHeader);

      if (!senderEmail || !message.id) {
        return null;
      }

      return {
        messageId: message.id,
        senderEmail,
        subject: subjectHeader,
        snippet: message.snippet || "",
        receivedAt: parseReceivedAt(dateHeader ?? undefined, message.internalDate ?? undefined)
      };
    })
    .filter((message): message is ProviderMessage => Boolean(message));
}

async function matchMessagesToCustomers(messages: ProviderMessage[], provider: Exclude<CustomerEmailAlertProvider, null>): Promise<CustomerEmailAlertsSummary> {
  const senderEmails = Array.from(new Set(messages.map((message) => message.senderEmail)));
  if (senderEmails.length === 0) {
    return emptySummary("ready", provider);
  }

  const customers = await prisma.customer.findMany({
    where: {
      isArchived: false,
      normalizedEmail: {
        in: senderEmails
      }
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      normalizedEmail: true
    }
  });

  const customerByEmail = new Map(customers.map((customer) => [customer.normalizedEmail, customer]));
  const messagesForCustomers: CustomerEmailAlertMessage[] = [];

  for (const message of messages) {
    const customer = customerByEmail.get(message.senderEmail);
    if (!customer) {
      continue;
    }

    messagesForCustomers.push({
      messageId: message.messageId,
      customerId: customer.id,
      customerName: customer.fullName,
      customerEmail: customer.email,
      senderEmail: message.senderEmail,
      subject: message.subject,
      snippet: message.snippet,
      receivedAt: message.receivedAt
    });
  }

  messagesForCustomers.sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));

  const matchedCustomers: CustomerEmailAlertCustomer[] = Array.from(
    messagesForCustomers.reduce((map, message) => {
      const existing = map.get(message.customerId);
      if (existing) {
        existing.messageCount += 1;
        return map;
      }

      map.set(message.customerId, {
        id: message.customerId,
        fullName: message.customerName,
        email: message.customerEmail,
        messageCount: 1
      });
      return map;
    }, new Map<string, CustomerEmailAlertCustomer>())
  ).map(([, customer]) => customer);

  logEvent("customer_email_alerts.checked", {
    provider,
    unreadCount: messagesForCustomers.length,
    matchedCustomers: matchedCustomers.length
  });

  return {
    state: "ready",
    provider,
    unreadCount: messagesForCustomers.length,
    matchedCustomers,
    messages: messagesForCustomers,
    checkedAt: new Date().toISOString()
  };
}

/**
 * Returns an owner-facing readiness view for Gmail and IMAP inbox providers.
 */
export async function getCustomerEmailAlertsStatusSummary(alertsEnabled: boolean): Promise<CustomerEmailAlertsStatusSummary> {
  const providerPreference = getAdminCustomerEmailAlertsProvider();

  const gmail: AlertProviderStatus = !isGmailConfigured()
    ? {
        status: "not_configured",
        message: "Gmail credentials are missing."
      }
    : await (async () => {
        try {
          const messages = await listUnreadGmailMessages();
          return {
            status: "connected" as const,
            email: process.env.GMAIL_USER_EMAIL || "",
            message: `Gmail inbox access is available${messages.length ? ` and currently sees ${messages.length} unread message${messages.length === 1 ? "" : "s"} in the sampled inbox.` : "."}`
          };
        } catch (error) {
          logError("gmail.customer_email_alerts_status_failed", error);
          return {
            status: "error" as const,
            message: "Unable to connect to Gmail inbox. Check credentials and token validity."
          };
        }
      })();

  const imap: AlertProviderStatus = !isImapConfigured()
    ? {
        status: "not_configured",
        message: "IMAP inbox settings are missing. Inbox alerts are locked to Gmail."
      }
    : await (async () => {
        try {
          const status = await getImapConnectionStatus();
          return {
            status: "connected" as const,
            email: status.user,
            mailbox: status.mailbox,
            message: `IMAP inbox access is available for mailbox ${status.mailbox}, but inbox alerts stay on Gmail.`
          };
        } catch (error) {
          logError("imap.customer_email_alerts_status_failed", error);
          return {
            status: "error" as const,
            message: "Unable to connect to the configured IMAP inbox. Inbox alerts still remain Gmail-only."
          };
        }
      })();

  const activeProvider = resolveActiveProviderFromStatuses(providerPreference, gmail, imap);

  return {
    alertsEnabled,
    providerPreference,
    activeProvider,
    gmail,
    imap
  };
}

export async function getUnreadCustomerEmailAlertsSummary(): Promise<CustomerEmailAlertsSummary> {
  const providers = resolveProviderAttempts();
  if (providers.length === 0) {
    return emptySummary("not_configured");
  }

  let lastProvider: CustomerEmailAlertProvider = null;

  for (const provider of providers) {
    lastProvider = provider;

    try {
      const providerMessages = await listUnreadProviderMessages(provider);

      if (providerMessages.length === 0) {
        return emptySummary("ready", provider);
      }

      return await matchMessagesToCustomers(providerMessages, provider);
    } catch (error) {
      logError("customer_email_alerts.failed", error, { provider });
    }
  }

  return emptySummary("ready", lastProvider);
}
