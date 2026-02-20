# Student Portal Login and Customer Learning Materials Implementation Plan

## Overview
Implement a customer-facing student portal with name+postcode+password login, automatic credential generation on first approved appointment, admin-visible portal credentials, and appointment-linked learning material management (audio/PDF) from the admin console.

## Current State Analysis
- Customer records already include `fullName` and `postcode`, and are linked to bookings/requests/series (`prisma/schema.prisma:226`, `prisma/schema.prisma:241`, `prisma/schema.prisma:245`).
- Booking-request approval currently creates booking records and sends only a generic approved/cancelled status email; no portal credential lifecycle exists (`src/app/api/admin/booking-requests/[id]/route.ts:73`, `src/app/api/admin/booking-requests/[id]/route.ts:172`, `src/app/api/admin/booking-requests/[id]/route.ts:180`).
- Public booking requests do not create/link customer records at submit time (`src/app/api/booking-requests/route.ts:30`).
- Admin already has customer management dialogs and an action-row pattern in the booking console that can host another button (`src/components/admin-bookings-client.tsx:1186`, `src/components/admin-bookings-client.tsx:1190`, `src/components/admin-bookings-client.tsx:1592`).
- Public top-nav is centrally driven from `navItems`; there is no current student-portal item (`src/lib/site-data.ts:32`, `src/components/site-shell.tsx:24`).
- There is currently only admin auth/session, no customer auth/session layer (`src/lib/admin-auth.ts:8`, `src/app/api/admin/login/route.ts:17`).
- Email infra already supports templates and attachments, so portal credential email copy can be added cleanly (`src/lib/email/templates.ts:95`, `src/lib/email/service.ts:6`, `src/lib/email/service.ts:67`).
- Environment/docs currently do not include student-portal or learning-material storage settings (`.env.example:1`, `.env.test.example:1`, `README.md:151`).

## Desired End State
- Website top menu includes `Student Portal` as the last nav item.
- Customers log in with full name, postcode, and generated password.
- On first appointment approval:
  - portal password is generated automatically,
  - approval email includes portal login URL + password.
- Admin can open a customer record and view that customer’s generated portal password (with explicit reveal UX).
- Student portal shows:
  - upcoming appointments,
  - previous appointments,
  - learning materials assigned to each appointment.
- Admin booking console includes a `Customer Learning Materials` action that:
  - opens a popup,
  - selects customer,
  - requires selecting one of that customer’s appointments,
  - supports upload/delete of PDF/audio materials tied to the selected appointment.

### Key Discoveries
- Approval flow already has a single, centralized point to attach first-approval credential generation (`src/app/api/admin/booking-requests/[id]/route.ts:73`).
- Customer directory and popup infrastructure already exist and match the requested “select customer from database” behavior (`src/components/admin-bookings-client.tsx:1592`, `src/components/admin-bookings-client.tsx:1635`).
- Booking/customer linking is already part of manual booking and schema relations, so appointment ownership enforcement can be DB-backed (`prisma/schema.prisma:185`, `src/app/api/admin/bookings/route.ts:159`).
- Public shell/nav is data-driven and simple to extend with a portal route entry (`src/lib/site-data.ts:32`, `src/components/site-shell.tsx:25`).

## Assumptions Locked for This Plan
- Portal credentials are one per customer and persist until admin explicitly rotates/regenerates them.
- To satisfy “admin can view password,” raw password is stored encrypted-at-rest for reveal, and a separate hash is used for login verification.
- Learning materials are always linked to both `customerId` and `bookingId` (booking selection is mandatory).
- Login matching allows duplicate names/postcodes by testing password against all candidates for that name+postcode pair (with candidate bounds and generic failures).

## Product Decisions Locked
1. Manually created bookings/customers trigger the same portal-credential provisioning path used by booking approvals.
2. Credential rotation is admin-driven via explicit regenerate action, with immediate invalidation, timestamp visibility, and audit logs.
3. Duplicate `fullName + postcode` login uses bounded multi-candidate bcrypt checks without adding extra disambiguation fields.
4. Learning-material downloads use authenticated API streaming endpoints by default (no direct signed URL delivery in v1).

## What We're NOT Doing
- Replacing admin authentication/session architecture.
- Building a multi-user student household account model.
- Building rich media streaming/transcoding.
- Sending portal password in every future approval email after first credential creation.

## Design Options
1. Plaintext password only in DB.
- Pros: simple to implement and display.
- Cons: unacceptable security risk.
2. Hash-only password (no admin reveal).
- Pros: secure.
- Cons: conflicts with explicit requirement to view password in admin.
3. Hash + encrypted password storage (selected).
- Pros: secure login verification with controlled admin reveal capability; satisfies requirement.
- Cons: requires encryption key management and rotation handling.

Selected approach: Option 3.

## Implementation Approach
- Extend customer identity model with normalized full-name lookup support for student login.
- Add portal-credential model with:
  - login hash,
  - encrypted cleartext password for admin reveal,
  - timestamps for generation/rotation.
- Hook credential generation into booking-request approval path after customer association is resolved.
- Add student session/auth utilities (cookie-based, parallel to admin approach but separate cookie/secret).
- Add appointment-linked learning-material model and admin CRUD endpoints with strict customer-booking ownership checks.
- Add storage abstraction for learning materials:
  - local filesystem driver for dev/test,
  - S3-compatible driver for production.

## Phase 1: Data Model and Security Primitives

### Overview
Create the schema and crypto foundations for student credentials, sessions, and learning materials.

### Changes Required

#### 1. Prisma Schema
**File**: `prisma/schema.prisma`  
**Changes**:
- Extend `Customer` with explicit normalized full-name lookup support:
  - `normalizedFullName` (required string, derived from `fullName`),
  - optional `nameSearchTokens` (if needed for future fuzzy search, not used for auth decisions).
- Add `CustomerPortalCredential` model:
  - `customerId` (unique),
  - `passwordHash`,
  - `passwordEncrypted`,
  - `generatedAt`,
  - `rotatedAt`,
  - `isActive`.
- Add `CustomerPortalCredentialAuditLog` model:
  - `customerId`,
  - `action` (`generated` | `rotated` | `revealed`),
  - `actorId`,
  - `details`,
  - `createdAt`.
- Add `LearningMaterial` model:
  - `customerId`,
  - `bookingId`,
  - `title`,
  - `materialType` (`audio` | `pdf`),
  - `storageKey`,
  - `mimeType`,
  - `sizeBytes`,
  - `uploadedById`,
  - timestamps.
- Add indexes:
  - customer login candidate lookup (`normalizedFullName`, `postcode`, `isArchived`) as a composite index used by student login,
  - keep existing email/phone indexes for customer matching in booking/admin flows,
  - material listing (`customerId`, `bookingId`, `createdAt`).

#### 2. Crypto and Credential Utilities
**Files**:
- `src/lib/student-portal/crypto.ts` (new)
- `src/lib/student-portal/credentials.ts` (new)
**Changes**:
- Add AES-GCM encrypt/decrypt helpers for stored portal passwords.
- Add generated-password factory with configurable length/charset.
- Add hash/verify helpers (bcrypt).
- Add typed helper APIs:
  - `ensurePortalCredentialForCustomer(customerId)`,
  - `rotatePortalCredential(customerId)`,
  - `revealPortalPasswordForAdmin(customerId)`.

### Success Criteria

#### Automated Verification
- [x] `npx prisma validate`
- [x] `npm run test:prepare`

#### Manual Verification
- [ ] Migration applies cleanly to local and test DBs.
- [ ] Existing booking/admin/invoice flows still load after schema changes.

---

## Phase 2: Approval Flow and Portal Email Lifecycle

### Overview
Generate first portal credentials during first approved appointment and send credentials in the approval email.

### Changes Required

#### 1. Customer Resolution in Approval Flow
**File**: `src/app/api/admin/booking-requests/[id]/route.ts`  
**Changes**:
- On `approve`, ensure request has a linked customer:
  - use existing `customerId` if present,
  - else find existing customer by normalized email/phone,
  - else create customer snapshot from request.
- Persist `customerId` back to request and all created bookings/series records.
- Enforce approval sequence in code:
  1. resolve/create customer,
  2. persist `customerId` on request + created booking rows,
  3. generate/retrieve portal credential,
  4. send approval email with portal credential payload.
- Add explicit guard that approval must fail fast if `customerId` cannot be resolved before credential/email steps.

#### 2. First-Approval Credential Generation
**Files**:
- `src/app/api/admin/booking-requests/[id]/route.ts`
- `src/lib/student-portal/credentials.ts` (new)
**Changes**:
- After customer association, call credential service:
  - create credential if none exists (returns generated password),
  - do not regenerate existing credentials on later approvals unless explicitly requested.
- Apply the same credential-provisioning service in:
  - manual booking create flow (`src/app/api/admin/bookings/route.ts`) when the booking/customer is created or linked,
  - admin customer create flow (`src/app/api/admin/customers/route.ts`) so customer records created manually also receive credentials.

#### 3. Approval Email Template Extension
**Files**:
- `src/lib/email/templates.ts`
- `src/lib/booking-events.ts`
**Changes**:
- Add customer approval email variant supporting optional portal credential section.
- Include:
  - student portal login URL,
  - login instructions (`Full name + postcode + password`),
  - generated password (only when first created).
- Ensure this email send runs only after the `customerId` linkage is confirmed and persisted in the approval transaction flow.

### Success Criteria

#### Automated Verification
- [x] Add route tests for approve path:
  - customer link creation,
  - first-time credential generation,
  - no duplicate credential regeneration.
- [x] Add template tests for approval email with and without portal credentials.

#### Manual Verification
- [ ] Approving a first appointment sends an email containing portal login details + generated password.
- [ ] Approving later appointments for same customer does not rotate password automatically.

---

## Phase 3: Student Auth and Portal Surface

### Overview
Implement customer login/logout/session and portal data display for appointments and materials.

### Changes Required

#### 1. Student Auth Routes and Session
**Files**:
- `src/app/api/student/login/route.ts` (new)
- `src/app/api/student/logout/route.ts` (new)
- `src/lib/student-portal/session.ts` (new)
**Changes**:
- Add login API accepting `fullName`, `postcode`, `password`.
- Resolve candidate customers by normalized full name + postcode and verify password hash.
- Implement bounded candidate verification (for example max 20 active matches) with:
  - generic authentication errors,
  - no user-enumeration hints,
  - deterministic evaluation order and telemetry for high-collision cases.
- Issue signed HTTP-only `student_session` cookie with customer identity + expiry.
- Add logout route to clear session cookie.

#### 2. Student Portal Data API
**Files**:
- `src/app/api/student/portal/route.ts` (new)
- `src/app/api/student/learning-materials/[id]/download/route.ts` (new)  
**Changes**:
- Return authenticated customer profile summary.
- Return customer bookings grouped into:
  - upcoming (`startAt >= now`),
  - previous (`startAt < now`).
- Return learning materials joined by selected booking IDs.
- Add authenticated file-download endpoint that streams material bytes after verifying student ownership.

#### 3. Student Pages and Components
**Files**:
- `src/app/student/login/page.tsx` (new)
- `src/app/student/portal/page.tsx` (new)
- `src/components/student-login-form.tsx` (new)
- `src/components/student-portal-client.tsx` (new)
**Changes**:
- Add login form and error states.
- Add authenticated portal page with:
  - upcoming appointment section,
  - previous appointment section,
  - per-appointment materials list and download links.

### Success Criteria

#### Automated Verification
- [x] Add tests for student login success/failure and session guard behavior.
- [x] Add tests for portal API payload shaping (upcoming/previous/material joins).

#### Manual Verification
- [ ] Student can log in using full name + postcode + generated password from approval email.
- [ ] Student portal shows correct previous/upcoming appointments.
- [ ] Assigned PDFs/audio appear and are downloadable.

---

## Phase 4: Admin Password Visibility and Learning Materials Workflow

### Overview
Add admin tooling for portal credential visibility and appointment-scoped learning-material upload/delete.

### Changes Required

#### 1. Portal Credential Admin Endpoints
**Files**:
- `src/app/api/admin/customers/[id]/portal-credential/route.ts` (new)
- `src/components/admin-bookings-client.tsx`
**Changes**:
- Add endpoint to fetch masked credential metadata and reveal decrypted password (admin-auth protected).
- Add `regenerate` action for admin-triggered rotation with confirmation and immediate invalidation of prior credential.
- In customer UI, show:
  - “Portal Password” reveal control,
  - `Generated` and `Last rotated` timestamps,
  - regenerate action with explicit warning.
- Emit credential audit-log records for generate/reveal/rotate operations.

#### 2. Learning Material Admin Endpoints
**Files**:
- `src/app/api/admin/customers/[id]/learning-materials/route.ts` (new)
- `src/app/api/admin/learning-materials/[id]/route.ts` (new)
**Changes**:
- Add list/create/delete material endpoints.
- Enforce business rule:
  - material create requires `bookingId`,
  - selected booking must belong to selected customer.
- Validate file type to allowed MIME/extensions (PDF + common audio types).

#### 3. Admin UI Flow
**File**: `src/components/admin-bookings-client.tsx`  
**Changes**:
- Add `Customer Learning Materials` button in legend action row beside existing actions.
- Add popup flow:
  - search/select customer from existing customer list,
  - select one previous/upcoming appointment for that customer,
  - upload file + title,
  - list existing materials for selected appointment,
  - delete selected material.

#### 4. Storage Abstraction
**Files**:
- `src/lib/student-portal/material-storage.ts` (new)
- `src/lib/student-portal/material-storage.local.ts` (new)
- `src/lib/student-portal/material-storage.s3.ts` (new)
**Changes**:
- Add storage interface for put/get/delete material files.
- Local driver for dev/test.
- S3-compatible driver for production.
- Persist only metadata + storage key in DB.
- Add authenticated download API that streams bytes through the app after customer ownership/session checks (v1 default).

### Success Criteria

#### Automated Verification
- [x] Add tests for admin portal-credential endpoints (auth + reveal/regenerate semantics).
- [x] Add tests for learning-material create/delete with booking-ownership validation.

#### Manual Verification
- [ ] Admin can reveal customer portal password from customer management UI.
- [ ] Admin cannot upload learning material without selecting a customer-owned appointment.
- [ ] Admin can upload and delete PDF/audio materials successfully.

---

## Phase 5: Public Navigation and Route Integration

### Overview
Expose the student portal entry point from the public website navigation and keep motion/shell behavior consistent.

### Changes Required

#### 1. Navigation Data
**File**: `src/lib/site-data.ts`  
**Changes**:
- Add `Student Portal` nav item at end of `navItems`.
- Add route ordering/footer copy updates for student login route where appropriate.

#### 2. Public Shell Integration
**Files**:
- `src/components/site-shell.tsx`
- `src/components/public-site-frame.tsx`
**Changes**:
- Ensure `/student/login` renders inside public shell/nav.
- Keep `/student/portal` as authenticated app surface (no public-shell coupling).

#### 3. Styling
**File**: `src/styles/globals.css`  
**Changes**:
- Add styles for student login and portal layout.
- Add admin materials-popup styling and responsive behavior.

### Success Criteria

#### Automated Verification
- [x] `npm run lint`
- [x] `npm run typecheck`

#### Manual Verification
- [ ] `Student Portal` appears as last top-menu item on desktop and mobile.
- [ ] Clicking nav item opens student login page and flow works end-to-end.

---

## Phase 6: Test Environment, Documentation, and Hardening

### Overview
Complete test coverage, environment sync, and operational documentation in same task per repository policy.

### Changes Required

#### 1. Automated Test Coverage
**Files**:
- `tests/student-portal-auth.test.ts` (new)
- `tests/student-portal-data.test.ts` (new)
- `tests/admin-learning-materials.test.ts` (new)
- `tests/admin-booking-approval-portal-credential.test.ts` (new)
- existing booking/customer tests as needed
**Changes**:
- Validate login, session expiry, portal data partitions, credential generation timing, admin reveal/regenerate, and material ownership rules.

#### 2. Environment and Docs Sync
**Files**:
- `.env.example`
- `.env.test.example`
- `README.md`
- `thoughts/tickets/2026-02-20-student-portal-login-learning-materials.md`
**Changes**:
- Add env vars for:
  - `STUDENT_SESSION_SECRET` (required in non-dev),
  - `STUDENT_SESSION_MAX_AGE_SECONDS` (default login session TTL),
  - `STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY` (required for admin password reveal and encrypted-at-rest storage),
  - `STUDENT_PORTAL_PASSWORD_LENGTH` (optional generated-password policy),
  - `LEARNING_MATERIALS_STORAGE_DRIVER` (`local` | `s3`),
  - `LEARNING_MATERIALS_LOCAL_ROOT` (required when `local`),
  - `LEARNING_MATERIALS_S3_BUCKET`,
  - `LEARNING_MATERIALS_S3_REGION`,
  - `LEARNING_MATERIALS_S3_ACCESS_KEY_ID`,
  - `LEARNING_MATERIALS_S3_SECRET_ACCESS_KEY`,
  - `LEARNING_MATERIALS_S3_PUBLIC_BASE_URL` (optional, if using direct URL delivery).
- Update route list and feature summary with student portal and learning materials.
- Update manual verification checklist for new student/admin workflows.
- Keep ticket status as `planned` until implementation starts.

### Success Criteria

#### Automated Verification
- [x] `npm run test:prepare`
- [x] `npm test`
- [x] `npm run lint`
- [x] `npm run typecheck`

#### Manual Verification
- [ ] Full smoke test:
  - submit booking request,
  - approve first appointment,
  - receive approval email with portal credentials,
  - student login,
  - view appointments/materials,
  - admin upload/delete material from customer appointment selection.

---

## Testing Strategy
- Unit tests:
  - credential generation/encryption/hash verification,
  - student-session signing/validation,
  - storage key and MIME classification.
- API integration tests:
  - student login/logout/portal endpoints,
  - approval mutation side effects,
  - learning-material admin CRUD and ownership constraints.
- Regression tests:
  - existing admin booking/customer/invoice routes.
- Manual tests:
  - public nav placement and responsive behavior,
  - end-to-end first-approval credential email flow.

## Performance Considerations
- Index login candidate query path (`normalizedFullName`, `postcode`, `isArchived`) to keep login fast.
- Keep portal payload bounded:
  - limit booking windows (for example, recent past + future upcoming) with pagination if needed.
- Avoid loading full file payloads in portal list APIs; return metadata + authenticated download route only.
- Keep admin material list queries scoped by `customerId` and selected `bookingId`.

## Migration Notes
- Backfill normalized full-name fields for existing customers in migration.
- Existing customers without portal credentials remain unaffected until:
  - first future approval creates credential automatically, or
  - admin explicitly generates credential from customer view.
- Preserve booking snapshots; learning materials are additive and appointment-linked.
- Ensure encryption key setup is required before enabling password reveal in non-dev environments.

## References
- Ticket: `thoughts/tickets/2026-02-20-student-portal-login-learning-materials.md`
- Related Ticket: `thoughts/tickets/2026-02-19-admin-manual-booking-modal-and-customer-directory.md`
- Related Plan: `thoughts/plans/admin-manual-booking-modal-and-customer-directory-implementation-plan.md`
- Related Plan: `thoughts/plans/booking-contact-admin-implementation-plan.md`
- Customer/booking schema baseline: `prisma/schema.prisma:90`
- Approval flow baseline: `src/app/api/admin/booking-requests/[id]/route.ts:73`
- Public booking request baseline: `src/app/api/booking-requests/route.ts:30`
- Admin customer directory UI baseline: `src/components/admin-bookings-client.tsx:1592`
- Admin action-row baseline: `src/components/admin-bookings-client.tsx:1186`
- Public nav baseline: `src/lib/site-data.ts:32`
- Public shell nav render baseline: `src/components/site-shell.tsx:24`
- Email infrastructure baseline: `src/lib/email/service.ts:44`
