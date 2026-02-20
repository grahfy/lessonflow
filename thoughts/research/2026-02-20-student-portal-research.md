---
date: 2026-02-20T06:31:18Z
git_commit: 13e2e3e745cbbbe66721180298d0dd945028ce60
branch: main
repository: melbourne_guitar_school_website
topic: "Student portal login and learning materials research"
tags: [research, student-portal, auth, admin, booking]
last_updated: 2026-02-20T06:43:50Z
---

## Ticket Synopsis
Ticket `thoughts/tickets/2026-02-20-student-portal-login-learning-materials.md:1` scopes a new student portal login surface, first-time portal credential generation on the first approved appointment, admin portal-password visibility, and an appointment-scoped learning-materials upload/delete workflow anchored in the existing booking approval experience.

## Summary
The codebase already has an admin session/token stack, a single approval handler that creates bookings and fires the status email, and admin UX (legend action row and customer dialog) that can host extra actions and modals. Ownership checks for customers and bookings, plus binary responses for PDFs, provide the structural templates needed for learning-material uploads/downloads. The open product decisions are now resolved and captured in the plan/ticket: manual booking/customer creation will also provision portal credentials, credential rotation will be explicit/admin-audited, duplicate name+postcode login will use bounded multi-candidate bcrypt verification, and learning-material downloads will use authenticated API streaming by default.

## Detailed Findings
### 1. Auth/session patterns to reuse for student sessions
- `src/lib/admin-auth.ts:8` implements cookie-named `admin_session`, HMAC-signed payloads in `createSessionToken`, bcrypt-backed password verification, and helpers to hydrate admins from tokens, which is the same pattern the student session can adopt with a parallel cookie and secret.
- `src/app/api/admin/login/route.ts:1` shows the existing login route that sets the secure, HttpOnly cookie after calling `createSessionToken`, demonstrating how to wire `NextResponse` cookies into Next.js routes.
- `src/lib/admin-route.ts:1` shows how `requireAdminFromRequest` reads the cookie from `request.cookies`, which mirrors how `student_session` middleware should tap the new cookie to guard portal APIs.

### 2. Booking approval flow and credential hook
- `src/app/api/admin/booking-requests/[id]/route.ts:73` is the single PATCH path where approving a request creates bookings/series, flips the request status, and immediately calls `sendCustomerBookingStatusEmail` inside the same block (`src/app/api/admin/booking-requests/[id]/route.ts:172`). That block is the natural place to resolve or create the portal credential before the email fires and to extend the status email with portal instructions.
- The booking-request creation route never sets `customerId` (`src/app/api/booking-requests/route.ts:30`), so the approval handler must reconcile/associate a `Customer` before credential generation. The schema marks `customerId` optional (`prisma/schema.prisma:90`), confirming that `customerId` needs to be populated there.
- `prisma/schema.prisma:226` shows `Customer` currently only has `fullName`, `postcode`, and normalized email/phone indexes, so the plan’s assumption about adding normalized-full-name lookups and portal credential tables will be a net expansion of the schema.

### 3. Admin customer-management + modal UX extension points
- The admin legend action row (`src/components/admin-bookings-client.tsx:1186`) already renders buttons for manual booking, customer directory, and invoices, so a new `Customer Learning Materials` button can slot alongside them and open a modal.
- The customers dialog (`src/components/admin-bookings-client.tsx:1592`) already mounts a searchable list with edit, invoice, and delete actions and nests a secondary customer-editor modal (`src/components/admin-bookings-client.tsx:1673`). This existing structure can be augmented with revealable password controls or a new modal section for learning-material uploads tied to the selected customer.

### 4. Ownership validation + file delivery
- Both the manual booking API (`src/app/api/admin/bookings/route.ts:171`) and the invoices creation API (`src/app/api/admin/invoices/route.ts:127`) validate that referenced customers exist, are not archived, and (for invoices) that selected bookings exist before proceeding, which is the pattern to reuse when enforcing that learning materials can only be added to customer-owned bookings.
- The invoice PDF route (`src/app/api/admin/invoices/[id]/pdf/route.ts:13`) demonstrates how to return binary content: it renders the PDF buffer and responds with `Uint8Array` plus `content-type`/`content-disposition` headers, so learning-material downloads can follow that structure once the storage driver supplies the bytes.

### 5. Plan update alignment and resolved decisions
- The implementation plan now explicitly requires normalized full-name auth support on `Customer` (`normalizedFullName`) and a composite login index on (`normalizedFullName`, `postcode`, `isArchived`) (`thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:93`, `thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:120`).
- The plan now names concrete environment variables for student session and encryption controls, including `STUDENT_SESSION_SECRET` and `STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY`, plus storage-driver variables for materials (`thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:401`).
- The plan now enforces an approval-flow sequence that resolves/creates customer, persists `customerId`, generates/retrieves credentials, and only then sends portal-enabled approval email (`thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:152`).
- Credential provisioning now explicitly applies to manual booking create and admin customer create flows as well (`thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:180`).
- Login duplicate handling is now locked to bounded multi-candidate bcrypt checks with generic failures and no extra disambiguation field (`thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:225`).
- Learning-material delivery is now locked to authenticated API streaming in v1 (`thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:322`).
- Remaining engineering risk is transactional integrity across DB writes + credential generation + outbound email side effects; implementation should define rollback/compensation behavior for partial failures.

## Code References
- `thoughts/tickets/2026-02-20-student-portal-login-learning-materials.md:1` – outlines the feature request and scope.
- `thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:1` – lists the phased implementation approach currently in use.
- `src/lib/admin-auth.ts:8` – HMAC-bytes tokens, session cookie name, bcrypt verification, and `getCurrentAdmin` helper.
- `src/app/api/admin/login/route.ts:1` – login route that uses `createSessionToken` and sets the cookie via `NextResponse`.
- `src/lib/admin-route.ts:1` – `requireAdminFromRequest` reads the cookie and hydrates the admin.
- `src/app/api/admin/booking-requests/[id]/route.ts:73` – approval path creating bookings/series, updating status, and sending customer status email.
- `src/app/api/booking-requests/route.ts:30` – booking-request creation that does not link customers.
- `prisma/schema.prisma:90` – `BookingRequest` model with optional `customerId`.
- `prisma/schema.prisma:226` – `Customer` model fields and indexes.
- `src/components/admin-bookings-client.tsx:1186` – legend action row with existing buttons.
- `src/components/admin-bookings-client.tsx:1592` – customer dialog and editor modal scaffold for portal/admin workflows.
- `src/app/api/admin/bookings/route.ts:171` and `src/app/api/admin/invoices/route.ts:127` – ownership validation patterns.
- `src/app/api/admin/invoices/[id]/pdf/route.ts:13` – binary response pattern for downloads.
- `.env.example:1` – current env vars do not mention student session or password encryption secrets.
- `thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:93` – normalized full-name lookup field requirement added.
- `thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:120` – composite login index requirement added.
- `thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:152` – approval sequence now requires persisting `customerId` before credential/email steps.
- `thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:180` – manual booking/customer create now included in credential provisioning path.
- `thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:225` – bounded multi-candidate login strategy locked.
- `thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:322` – authenticated API streaming download strategy locked.
- `thoughts/plans/student-portal-login-learning-materials-implementation-plan.md:401` – concrete student session/encryption/storage env vars added.

## Architecture Insights
The existing approval flow, admin authentication, and customer dialogs form the spine of the desired feature, so the student portal can reuse the session cookie pattern plus the single approval mutation to bootstrap credentials and email content without touching unrelated routes. Ownership validation and binary-download patterns already exist in the admin APIs, letting new learning-materials endpoints mirror those best practices.

## Historical Context (from thoughts)
The adjacent plan `thoughts/plans/admin-manual-booking-modal-and-customer-directory-implementation-plan.md:1` already introduced the modal infrastructure the admin console currently leverages, so building the learning-material/usability flows on that same scaffold keeps consistency.

## Related Research
- `thoughts/plans/booking-contact-admin-implementation-plan.md:1` and `thoughts/plans/admin-manual-booking-modal-and-customer-directory-implementation-plan.md:1` describe prior efforts around admin-booking modals and customer directory patterns that inform this task.

## Open Questions
None currently. Product-direction questions for v1 are resolved in the ticket and implementation plan.
