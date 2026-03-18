export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_METADATA_SCOPE = "https://www.googleapis.com/auth/gmail.metadata";

/**
 * RATIONALE: The app sends mail via Gmail and also reads sent-message bodies
 * back during admin history sync. `gmail.metadata` is not sufficient for that
 * second capability because it cannot return `format=full` bodies or support
 * Gmail `q` filters.
 */
export const GMAIL_REQUIRED_SCOPES = [GMAIL_SEND_SCOPE, GMAIL_READONLY_SCOPE] as const;
