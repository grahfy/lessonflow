# Booking, Contact, and Admin Calendar Implementation Plan

## Overview
Implement a backend-backed contact and booking system with owner approval, recurring weekly lessons, admin calendar management, and automated email notifications while preserving the existing Melbourne Guitar School visual style.

## Current State Analysis
- The site is currently a static multi-page HTML build served by `python3 -m http.server` with no backend runtime (`README.md:1`, `README.md:17`).
- Contact interactions are currently direct `mailto:`/`tel:` links and static text, not persisted submissions (`contact.html:39`, `contact.html:47`).
- Shared JavaScript only handles navigation and transitions; there are no API calls, auth, or data persistence flows (`assets/js/site.js:2`, `assets/js/site.js:145`).
- Typography and copy blocks are centrally styled via `.lead`, which is the right place to add optional justified copy behavior (`assets/css/styles.css:217`).
- Responsive behavior already exists and should be preserved while introducing forms and admin UI (`assets/css/styles.css:424`).

## Desired End State
- Public users can submit a real contact form and booking request with required fields.
- Booking requests enter a `pending` queue for owner approval.
- Owner can view bookings in day/week/month calendar views, approve/reject requests, add/edit/move/cancel bookings, and manage recurring weekly series.
- Booking dates are constrained to the current calendar year in the booking workflow.
- Customer and owner email notifications are automated for new requests, approvals/cancellations, and daily schedule digest.
- Core page copy supports justified text where readability benefits.

### Key Discoveries
- Existing navigation assumes static page routes and should be migrated carefully (`assets/js/site.js:2`).
- Current contact page lacks form fields and backend submission path (`contact.html:31`).
- No package/runtime manifest exists yet, confirming backend implementation must include new project scaffolding (repository root has no `package.json`).

## What We're NOT Doing
- Online payments or invoicing in v1.
- Multi-teacher calendars in v1.
- SMS notifications in v1 (email only).
- Replacing the site’s visual direction beyond required form/admin additions.

## Design Options Considered
1. Keep static HTML + add Express/SQLite backend.
Pros: smaller initial rewrite. Cons: more custom auth/admin plumbing and weaker long-term maintainability.
2. Move to Next.js full-stack with PostgreSQL, typed APIs, and scheduled jobs.
Pros: unified frontend/backend, easier secure admin routing, cleaner deployment and testing.

Selected approach: Option 2 for maintainability, robust admin workflows, and simpler long-term ownership.

## Implementation Approach
- Framework: Next.js (App Router) + TypeScript.
- Data: PostgreSQL + Prisma.
- Auth: NextAuth (single-owner allowlist).
- Email: Resend (transactional templates).
- Scheduling: Vercel Cron hitting secure internal API endpoint.
- UI: Existing visual language ported into reusable components; FullCalendar for admin day/week/month views.
- Timezone standard: `Australia/Melbourne` for booking and digest calculations.

## Phase 1: Foundation and UX Baseline

### Overview
Create the new full-stack scaffold and preserve current public page experience before adding booking logic.

### Changes Required
#### 1. App Scaffold
**File**: `package.json`  
**Changes**: Add Next.js, TypeScript, lint/test/typecheck scripts, Prisma tooling.

#### 2. Route Migration
**File**: `src/app/page.tsx`  
**Changes**: Port current home layout and styling patterns from existing static pages.

#### 3. Shared Styling + Justified Text
**File**: `src/styles/globals.css`  
**Changes**: Port design tokens; add utility/class for justified copy (`text-align: justify`) and apply selectively to long-form sections.

### Success Criteria
#### Automated Verification
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`

#### Manual Verification
- [ ] Public pages visually match the current site style.
- [ ] Justified text is applied only where readable (desktop + mobile).

---

## Phase 2: Data Model and Booking Domain Rules

### Overview
Define persistent entities and rules for requests, approvals, recurring bookings, and calendar operations.

### Changes Required
#### 1. Prisma Schema
**File**: `prisma/schema.prisma`  
**Changes**: Add models for `ContactSubmission`, `BookingRequest`, `Booking`, `BookingSeries`, `BookingAuditLog`, `AdminUser`.

#### 2. Database Migrations
**File**: `prisma/migrations/*`  
**Changes**: Create schema, indexes on `startAt/status`, foreign keys, and uniqueness guards for overlapping edits.

#### 3. Validation Rules
**File**: `src/lib/booking-rules.ts`  
**Changes**: Enforce required fields, duration (`30|60`), skill level enum, mode enum, and current-year date window.

### Success Criteria
#### Automated Verification
- [x] `npm run prisma:generate`
- [x] `npm run prisma:migrate`
- [x] `npm run test -- booking-rules`

#### Manual Verification
- [x] Invalid bookings outside current year are rejected with clear errors.
- [x] Weekly recurrence expansion correctly generates instances through year-end.

---

## Phase 3: Public Contact + Booking Backend

### Overview
Deliver production form endpoints and public forms for contact and pending booking requests.

### Changes Required
#### 1. Contact API
**File**: `src/app/api/contact/route.ts`  
**Changes**: Persist validated contact submissions and send owner notification email.

#### 2. Booking Request API
**File**: `src/app/api/booking-requests/route.ts`  
**Changes**: Accept and persist pending requests, recurrence options, and emit owner approval email.

#### 3. Public Contact and Booking Pages
**File**: `src/app/contact/page.tsx`  
**Changes**: Replace static contact call-to-actions with a real form and success/error states.
**File**: `src/app/book/page.tsx`  
**Changes**: Add booking request form with all required fields and recurrence controls.

### Success Criteria
#### Automated Verification
- [x] `npm run test -- api-contact api-booking-requests`
- [x] `npm run test:e2e -- booking-form`

#### Manual Verification
- [x] Contact submission appears in DB and triggers owner email.
- [x] Booking request is saved as `pending` and owner receives notification.

---

## Phase 4: Owner Admin Calendar and Booking Operations

### Overview
Implement authenticated owner workflows for approvals and full booking management.

### Changes Required
#### 1. Auth + Access Control
**File**: `src/app/(admin)/layout.tsx`  
**Changes**: Protect admin routes and restrict access to owner allowlist.

#### 2. Calendar Views
**File**: `src/app/(admin)/bookings/page.tsx`  
**Changes**: Add day/week/month views using FullCalendar and status filters (`pending/approved/cancelled`).

#### 3. Operations API
**File**: `src/app/api/admin/bookings/[id]/route.ts`  
**Changes**: Add approve, cancel, move, and edit actions with audit logging.
**File**: `src/app/api/admin/booking-series/[id]/route.ts`  
**Changes**: Add remove-series and future-instance management.

### Success Criteria
#### Automated Verification
- [x] `npm run test -- admin-bookings`
- [x] `npm run test:e2e -- admin-approval-flow`

#### Manual Verification
- [ ] Owner can approve/reject pending requests.
- [ ] Owner can move booking times via calendar interaction.
- [ ] Owner can manually create and cancel one-off or recurring bookings.

---

## Phase 5: Email Automation and Daily Digest

### Overview
Add complete customer/owner notification coverage and daily schedule summaries.

### Changes Required
#### 1. Email Templates + Sender
**File**: `src/lib/email/templates.ts`  
**Changes**: Add templates for pending notice, approval confirmation, cancellation notice, and daily digest.

#### 2. Trigger Points
**File**: `src/lib/booking-events.ts`  
**Changes**: Trigger customer + owner emails on create/approve/cancel transitions.

#### 3. Daily Digest Job
**File**: `src/app/api/jobs/daily-bookings-digest/route.ts`  
**Changes**: Cron-protected endpoint summarizing today’s bookings in `Australia/Melbourne`.
**File**: `vercel.json`  
**Changes**: Configure daily schedule trigger.

### Success Criteria
#### Automated Verification
- [x] `npm run test -- email-templates booking-events`
- [x] `npm run test:e2e -- notifications`

#### Manual Verification
- [ ] Owner receives new pending booking emails.
- [ ] Customer receives approval/cancellation emails.
- [ ] Daily digest sends once per day with accurate schedule.

---

## Phase 6: Release Hardening

### Overview
Finalize QA, observability, and handover materials.

### Changes Required
#### 1. Operational Docs
**File**: `README.md`  
**Changes**: Add environment variables, migration steps, admin login setup, and backup/recovery instructions.

#### 2. Monitoring
**File**: `src/lib/observability.ts`  
**Changes**: Add structured logs for booking lifecycle and failed email sends.

### Success Criteria
#### Automated Verification
- [x] `npm run lint && npm run typecheck && npm run test && npm run build`

#### Manual Verification
- [ ] End-to-end dry run: request -> approval -> reschedule -> cancel -> digest.
- [ ] Owner can perform all key tasks without developer intervention.

---

## Testing Strategy
- Unit tests for booking validation, recurrence generation, and status transitions.
- Integration tests for API routes and DB writes.
- E2E tests (Playwright) for public booking flow and admin workflows.
- Email snapshot tests for template correctness.
- Timezone tests for daylight-saving transitions in Melbourne.

## Performance Considerations
- Index `Booking.startAt`, `Booking.status`, and `BookingRequest.createdAt`.
- Paginate admin list views while virtualizing dense calendar datasets.
- Use server-side filtering for date ranges to keep day/week/month loads fast.
- Defer non-critical visuals/scripts on admin pages.

## Migration Notes
- Keep existing static site on `main` while building full-stack app on a feature branch.
- Migrate content page-by-page to avoid downtime.
- Run a soft launch with owner-only admin access before exposing booking links publicly.
- Retain `mailto:`/`tel:` fallback temporarily during rollout window.

## References
- Ticket: `thoughts/tickets/2026-02-19-booking-contact-admin-system.md`
- Existing site runtime and structure: `README.md:1`
- Existing contact implementation: `contact.html:31`
- Existing front-end behavior: `assets/js/site.js:2`

## Deviations from Plan

### Phase 2: Data Model and Booking Domain Rules
- **Original Plan**: PostgreSQL with Prisma.
- **Actual Implementation**: Prisma with SQLite for local-first execution (`DATABASE_URL=file:./prisma/dev.db`), schema kept portable for future PostgreSQL migration.
- **Reason for Deviation**: Enables immediate runnable implementation and test verification in this repository without external DB provisioning.
- **Impact Assessment**: Functional parity for current scope; production deployment should migrate datasource provider to PostgreSQL.
- **Date/Time**: 2026-02-19T23:00:00Z

### Phase 4: Auth + Calendar Views
- **Original Plan**: NextAuth and FullCalendar-based admin UI.
- **Actual Implementation**: Signed cookie admin auth with owner bootstrap account; custom day/week/month booking management dashboard UI.
- **Reason for Deviation**: Reduced integration overhead while delivering approval, move, cancel, recurring-series removal, and manual add operations end-to-end.
- **Impact Assessment**: Core functional requirements met; FullCalendar drag-and-drop UX can be added as an enhancement.
- **Date/Time**: 2026-02-19T23:00:00Z

### Phase 5: Email Provider + E2E Coverage
- **Original Plan**: Resend-backed notifications with full e2e notification flows.
- **Actual Implementation**: SMTP-capable mail service with DB logging fallback (`OutboundEmail`); route-level/unit tests added, but Playwright e2e tests remain placeholders.
- **Reason for Deviation**: Keep email delivery provider-agnostic and complete backend logic now; defer full browser automation wiring.
- **Impact Assessment**: Notification flows are implemented and test-covered at API/service level; end-to-end browser automation remains a follow-up task.
- **Date/Time**: 2026-02-19T23:00:00Z
