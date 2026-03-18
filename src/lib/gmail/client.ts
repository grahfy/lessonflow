import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

export { GMAIL_METADATA_SCOPE, GMAIL_READONLY_SCOPE, GMAIL_REQUIRED_SCOPES, GMAIL_SEND_SCOPE } from "./scopes";

/**
 * Creates a Gmail OAuth2 client for either runtime API access or local setup
 * flows such as refresh-token generation.
 */
export function createGmailOAuthClient(options?: { redirectUri?: string; refreshToken?: string }): OAuth2Client {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Gmail OAuth2 client configuration in environment variables.");
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    options?.redirectUri || "http://localhost"
  );

  if (options?.refreshToken) {
    oauth2Client.setCredentials({
      refresh_token: options.refreshToken
    });
  }

  return oauth2Client;
}

/**
 * Creates and returns an authenticated OAuth2 client for Gmail.
 */
export function getGmailAuth(): OAuth2Client {
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error("Missing Gmail OAuth2 configuration in environment variables.");
  }

  return createGmailOAuthClient({
    // Redirect URI is not needed for refreshing tokens.
    redirectUri: "http://localhost",
    refreshToken
  });
}

/**
 * Returns an authenticated Gmail service instance.
 */
export function getGmailClient() {
  const auth = getGmailAuth();
  return google.gmail({ version: "v1", auth });
}
