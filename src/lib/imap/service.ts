import { createImapClient } from "@/lib/imap/client";
import { getImapConfig } from "@/lib/env";

export type ImapUnreadMessage = {
  messageId: string;
  senderEmail: string;
  subject: string;
  snippet: string;
  receivedAt: string;
};

export type ImapConnectionStatus = {
  mailbox: string;
  user: string;
};

function toPreviewText(source: Buffer): string {
  const body = source
    .toString("utf8")
    .split(/\r?\n\r?\n/, 2)[1] || "";

  return body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/=\r?\n/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

async function withImapMailbox<T>(callback: (client: ReturnType<typeof createImapClient>) => Promise<T>): Promise<T> {
  const client = createImapClient();
  const { mailbox } = getImapConfig();

  await client.connect();
  const lock = await client.getMailboxLock(mailbox);

  try {
    return await callback(client);
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}

/**
 * Verifies IMAP connectivity and configured mailbox access.
 */
export async function getImapConnectionStatus(): Promise<ImapConnectionStatus> {
  const config = getImapConfig();

  return withImapMailbox(async () => ({
    mailbox: config.mailbox,
    user: config.user
  }));
}

/**
 * Returns recent unread messages from the configured IMAP mailbox.
 */
export async function listUnreadImapMessages(maxResults: number = 20): Promise<ImapUnreadMessage[]> {
  return withImapMailbox(async (client) => {
    const uids = (await client.search({ seen: false }, { uid: true })) || [];
    const newestUids = [...uids].sort((left, right) => right - left).slice(0, maxResults);
    const messages: ImapUnreadMessage[] = [];

    for (const uid of newestUids) {
      const message = await client.fetchOne(
        String(uid),
        {
          envelope: true,
          internalDate: true,
          source: true
        },
        { uid: true }
      );

      if (!message) {
        continue;
      }

      const senderEmail = message.envelope?.from?.[0]?.address?.trim().toLowerCase() || "";
      if (!senderEmail) {
        continue;
      }

      const receivedAt =
        message.internalDate instanceof Date
          ? message.internalDate.toISOString()
          : typeof message.internalDate === "string" && message.internalDate
            ? new Date(message.internalDate).toISOString()
            : new Date().toISOString();

      messages.push({
        messageId: String(message.uid || uid),
        senderEmail,
        subject: message.envelope?.subject || "(no subject)",
        snippet: message.source ? toPreviewText(message.source) : "",
        receivedAt
      });
    }

    return messages;
  });
}
