import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

/**
 * Creates and returns an authenticated OAuth2 client for Gmail.
 */
export function getGmailAuth(): OAuth2Client {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Gmail OAuth2 configuration in environment variables.");
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    // Redirect URI is not needed for refreshing tokens
    "http://localhost"
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return oauth2Client;
}

/**
 * Returns an authenticated Gmail service instance.
 */
export function getGmailClient() {
  const auth = getGmailAuth();
  return google.gmail({ version: "v1", auth });
}
