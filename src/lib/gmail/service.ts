import { google } from "googleapis";
import { getGmailClient } from "./client";

/**
 * Lists messages from the "Sent" label in Gmail.
 * Supports basic pagination via maxResults.
 */
export async function listSentMessages(maxResults: number = 50, pageToken?: string) {
  const gmail = getGmailClient();
  const response = await gmail.users.messages.list({
    userId: "me",
    q: "label:SENT",
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
export async function getMessageDetails(messageId: string) {
  const gmail = getGmailClient();
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
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
