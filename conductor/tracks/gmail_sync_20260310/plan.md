# Implementation Plan: Gmail Integration & Two-Way Sync

This plan follows the project's standard TDD workflow.

## Phase 1: Database & Environment Preparation [checkpoint: 011da99]
Update the data model to track provider information and external IDs for deduplication.

- [x] Task: Update `OutboundEmail` model in `schema.prisma`. [7dc184f]
    - [x] Add `provider` (String, default "smtp").
    - [x] Add `externalId` (String, unique, nullable).
    - [x] Add `source` (String, default "app").
- [x] Task: Execute database migration. [83d803e]
    - [x] `npx prisma migrate dev --name add_email_sync_fields`
- [x] Task: Update `.env.example` with `EMAIL_PROVIDER` setting. [985c9e8]
- [x] Task: Conductor - User Manual Verification 'Phase 1: Database & Environment Preparation' (Protocol in workflow.md)

## Phase 2: Gmail API Client [checkpoint: 1c4b363]
Implement the low-level service for interacting with Gmail API.

- [x] Task: Install `googleapis` dependency.
- [x] Task: Create `src/lib/gmail/client.ts` for OAuth2 authentication logic. [873f580]
- [x] Task: Implement `sendGmail` function in `src/lib/gmail/service.ts`. [b4719bc]
- [x] Task: Implement `listSentMessages` and `getMessageDetails` in `src/lib/gmail/service.ts`. [b4719bc]
- [x] Task: Conductor - User Manual Verification 'Phase 2: Gmail API Client' (Protocol in workflow.md)

## Phase 3: Core Email Service Integration
Modify the existing email service to support multiple providers.

- [x] Task: Update `src/lib/email/service.ts` to select provider based on environment variable. [64b12b8]
- [x] Task: Implement provider-specific logic in `sendEmail`. [64b12b8]
- [x] Task: Ensure all sent emails record their `provider` and `externalId` (if applicable) in the database. [64b12b8]
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Core Email Service Integration' (Protocol in workflow.md)

## Phase 4: Background Synchronization
Implement the logic to pull sent items from Gmail.

- [ ] Task: Create `src/lib/gmail/sync.ts` logic for fetching and deduplicating emails.
- [ ] Task: Create background job route `src/app/api/jobs/gmail-sync/route.ts`.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Background Synchronization' (Protocol in workflow.md)

## Phase 5: UI & Visibility
Expose the new information in the admin dashboard.

- [ ] Task: Update Email History UI to show provider/source labels.
- [ ] Task: Add "Sync Now" button to Email History view.
- [ ] Task: Add Gmail connection status to Admin Settings.
- [ ] Task: Conductor - User Manual Verification 'Phase 5: UI & Visibility' (Protocol in workflow.md)
