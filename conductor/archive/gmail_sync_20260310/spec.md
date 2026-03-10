# Specification: Gmail Integration & Two-Way Email History Sync

## Overview
Enable LessonFlow to use a Gmail account (via OAuth2) as the primary email provider and synchronize the email history. This allows admins to see a unified view of all communications, whether sent through the LessonFlow app or directly from the Gmail interface.

## User Roles & Impact
- **Admins:** Can configure Gmail integration and view a comprehensive communication history with students/customers.
- **System:** Automatically switches from default SMTP to Gmail when configured and periodically syncs external sent items.

## Functional Requirements

### 1. Gmail OAuth2 Integration
- Use existing environment variables: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `GMAIL_USER_EMAIL`.
- Implement a Gmail Service that uses the Google APIs client library.
- Securely handle token refreshing.

### 2. Global Provider Setting
- Add an admin setting (or use presence of GMAIL variables) to toggle between "Standard SMTP" and "Gmail".
- When "Gmail" is active, all system-generated emails (invoices, reminders, etc.) are sent via the Gmail API.

### 3. Two-Way History Synchronization
- **Outbound Sync:** Every email sent *through* LessonFlow is recorded in the `OutboundEmail` (or equivalent) table with a `provider: "gmail"` marker.
- **Inbound Sync:** Implement a background job (or manual trigger) that fetches "Sent" messages from the configured Gmail account.
- **Deduplication:** Ensure emails sent via the app (which appear in Gmail's Sent folder) are not duplicated in the local history.
- **Content Storage:** Store the full body and metadata of synced emails in the local database for fast retrieval and auditing.

### 4. UI Enhancements
- Update the Email History view to label emails with their source (e.g., "Sent via App", "Sent via Gmail UI").
- Display status indicators for the Gmail connection (e.g., "Connected", "Re-authentication required").

## Non-Functional Requirements
- **Security:** OAuth2 credentials must never be exposed in the UI.
- **Performance:** Sync jobs should run asynchronously to avoid blocking the main thread.
- **Reliability:** Graceful fallback to logged errors if the Gmail API is unreachable.

## Acceptance Criteria
- [ ] Emails can be successfully sent from LessonFlow using the Gmail API.
- [ ] Emails sent directly from the Gmail website appear in the LessonFlow history after a sync.
- [ ] No duplicate entries exist for emails sent through the app.
- [ ] Admins can toggle between Gmail and SMTP without data loss.

## Out of Scope
- Integration with other providers (Outlook, Yahoo).
- Reading/Syncing *received* (Inbox) emails (this track is specifically for history of *sent* communications).
- Real-time "webhook" style sync (polling or manual triggers are sufficient for V1).
