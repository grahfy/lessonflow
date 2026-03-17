import { getGmailClient } from "./client";

/**
 * Lists messages from the "Sent" label in Gmail.
 * Supports basic pagination via maxResults.
 */
export async function listSentMessages(maxResults: number = 50, pageToken?: string) {
  const gmail = getGmailClient();
  const response = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["SENT"],
    maxResults,
    pageToken,
  });

  return {
    messages: response.data.messages || [],
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Lists unread inbox messages from Gmail for lightweight owner alert checks.
 */
export async function listUnreadInboxMessages(maxResults: number = 20, pageToken?: string) {
  const gmail = getGmailClient();
  const response = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["INBOX", "UNREAD"],
    maxResults,
    pageToken,
  });

  return {
    messages: response.data.messages || [],
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Fetches full details for a specific Gmail message.
 */
export async function getMessageDetails(
  messageId: string,
  format: "full" | "metadata" | "minimal" = "full",
  options?: { metadataHeaders?: string[] }
) {
  const gmail = getGmailClient();
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format,
    metadataHeaders: options?.metadataHeaders,
  });

  return response.data;
}

/**
 * Sends an email using the Gmail API.
 * This is a lower-level wrapper around the Gmail API messages.send.
 */
export async function sendGmailRaw(rawMessage: string) {
  const gmail = getGmailClient();
  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: rawMessage,
    },
  });

  return response.data;
}
