# Admin UI Polish, Manual Rewrite, and Student Portal Contract Sync Implementation Plan

## Overview

Deliver the requested epic in five phases:

1. Admin dialog quick wins and reliability fixes.
2. Systemwide descriptive tooltip foundation and rollout.
3. Full manual rewrite and legacy documentation replacement with refreshed screenshot automation.
4. Student portal contract refactor to align with current admin/API evolution.
5. Cross-surface verification, hardening, and release readiness.

This sequencing prioritizes low-risk user-visible fixes first, then platform-level changes, then broad content and contract refactors.

## Current State Analysis

- Customer dialog heading currently renders `Customer Details` (no trailing colon) in `src/components/admin/customers/customer-dialog-wrapper.tsx:114`.
- Invoice detail dialog already exposes `MARK AS PAID` in footer when status is `sent` (`src/components/admin/invoices/invoices-client.tsx:486`), while backend accepts `mark_paid` without explicit status precondition (`src/app/api/admin/invoices/[id]/route.ts:108`).
- Edit-booking modal has nested overflow layers and no document-level scroll lock:
  - `src/components/admin/ui/admin-dialog.tsx:56`
  - `src/styles/globals.css:1574`
  - `src/styles/globals.css:1615`
- Tooltip support is ad-hoc and sparse (`title` attributes in forms), with no shared tooltip primitive and no tooltip package installed (`package.json:31`, `src/components/student-login-form.tsx:81`, `src/components/booking-form.tsx:214`).
- In-app manual is hard-coupled to `Documentation/**` via manifest/whitelist and screenshot sync scripts:
  - `src/lib/manual/content.ts:195`
  - `src/lib/manual/content.ts:331`
  - `tests/e2e/docs-screenshots.spec.ts:6`
  - `scripts/sync-manual-screenshots.cjs:6`
- Manual UI class naming drift exists between components and stylesheet, increasing risk for redesign work:
  - component classes at `src/components/admin/manual/manual-section-client.tsx:83`
  - defined CSS classes at `src/styles/globals.css:3884`
- Student portal clients duplicate local API types and deserialize via casts without shared runtime validation:
  - `src/components/student-portal-client.tsx:41`
  - `src/components/student-materials-client.tsx:26`
  - canonical route output in `src/app/api/student/portal/route.ts:110`

## Desired End State

- Customer dialog title is exactly `Customer Details:`.
- Invoice dialog presents payment-state actions in a clear, consistent way, aligned with backend transition rules.
- Booking edit dialog locks background scroll while open, with stable internal scrolling.
- Descriptive tooltips are available across major UI actions using one accessible system.
- Manual is fully rewritten, visually improved, and synced with refreshed Playwright screenshots; legacy docs are replaced/removed safely.
- Student portal and related clients consume shared validated contracts, eliminating duplicated local payload typing.

### Key Discoveries

- `src/components/admin/customers/customer-dialog-wrapper.tsx:114` - single-source customer dialog title string.
- `src/components/admin/invoices/invoices-client.tsx:486` - existing paid/unpaid footer action rendering.
- `src/app/api/admin/invoices/[id]/route.ts:108` - backend action allows `mark_paid` transition path.
- `src/components/admin/ui/admin-dialog.tsx:56` - dialog content overflow wrapper.
- `src/styles/globals.css:1574` and `src/styles/globals.css:1615` - nested modal overflow contracts.
- `src/lib/manual/content.ts:195` and `src/lib/manual/content.ts:331` - manual source and whitelist lock to `Documentation/**`.
- `tests/e2e/docs-screenshots.spec.ts:219` and `tests/e2e/docs-screenshots.spec.ts:248` - stale selectors/labels for current UI.
- `src/components/student-portal-client.tsx:41` and `src/components/student-materials-client.tsx:26` - duplicated client payload types.

## What We're NOT Doing

- Rebuilding invoice billing business logic or introducing a new payment subsystem.
- Replacing admin/student auth architecture beyond required UI/API contract alignment.
- Introducing a second documentation storage system in parallel with no migration path.
- Shipping broad visual redesigns outside requested dialog/manual/student scope.

## Implementation Approach

- Use one master plan and execute by risk tier.
- Keep behavior changes and documentation pipeline changes in separate phases.
- Preserve route contracts where possible; when changing rules, align UI and API in the same phase.
- For the manual rewrite, migrate with compatibility checkpoints before removing legacy files.

## Phase 1: Admin Dialog Quick Wins and Scroll Lock Foundation

### Overview

Implement requested admin-facing fixes with minimal blast radius: customer title, invoice action discoverability alignment, and modal background scroll lock.

### Changes Required

#### 1. Customer Dialog Title Copy Fix
**File**: `src/components/admin/customers/customer-dialog-wrapper.tsx`
**Changes**:
- Update `title="Customer Details"` to `title="Customer Details:"`.

#### 2. Invoice Dialog Mark-as-Paid UX and Rule Alignment
**Files**:
- `src/components/admin/invoices/invoices-client.tsx`
- `src/app/api/admin/invoices/[id]/route.ts`
- `src/lib/admin/use-invoices.ts`
**Changes**:
- Keep `Mark as Paid`/`Mark as Unpaid` in one clear action zone in invoice detail dialog.
- Add status eligibility helper in UI so action visibility is explicit and deterministic.
- Add backend guard rails for invalid lifecycle transitions so UI/API cannot diverge silently.
- Preserve existing `remind`, `void`, and delete constraints.

#### 3. Modal Background Scroll Lock
**Files**:
- `src/components/admin/ui/admin-dialog.tsx`
- `src/styles/globals.css`
- `src/components/admin/bookings/booking-detail-dialog.tsx`
**Changes**:
- Add document body scroll lock while any `AdminDialog` is open; restore on close/unmount.
- Collapse nested overflow behavior for booking detail to one intended scroll container.
- Verify header/footer remain visible while inner dialog content scrolls.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [ ] `npm run lint`
- [x] Add/update targeted tests for invoice action visibility and invalid transition handling.

#### Manual Verification
- [x] Customer dialog header shows exactly `Customer Details:`.
- [x] Invoice detail dialog shows clear eligible payment-state actions and updates status correctly.
- [x] In booking edit dialog, background page does not scroll while modal is open.
- [x] Closing modal restores page scroll.

### Phase 1 Execution Lock (2026-03-04)

#### Approved Scope

- Execute **Phase 1 only** in this delivery window.
- Enforce **strict server-side invoice lifecycle transitions** to match UI visibility rules.
- Keep manual migration as **two-step cutover** in later phases (not part of this phase).

#### File-Level Implementation Spec

1. **Customer dialog title exact copy**
   - `src/components/admin/customers/customer-dialog-wrapper.tsx`
   - Change title to exact string: `Customer Details:`.

2. **Shared invoice transition helper**
   - `src/lib/invoices/transitions.ts` (new)
   - Add `canApplyInvoiceAction(status, action)` and `allowedStatusesForAction(action)`.
   - Rules:
     - `mark_paid` allowed from `sent` only.
     - `mark_unpaid` allowed from `paid` only.
     - `void` allowed from `sent` and `paid` only.

3. **Strict transition guards in invoice API**
   - `src/app/api/admin/invoices/[id]/route.ts`
   - Validate `mark_paid`, `mark_unpaid`, and `void` against shared helper before mutation.
   - Reject invalid transition with `400`:
     - `{ error: "Invalid invoice transition.", details: { action, status, allowedFrom } }`
   - Preserve existing behavior for `edit`, `restore`, audit logs, and delete constraints.

4. **Invoice dialog action visibility alignment**
   - `src/components/admin/invoices/invoices-client.tsx`
   - Compute action visibility from shared transition helper (remove ad-hoc status checks).
   - Keep payment-state actions in one footer action zone.
   - Remove duplicate `RESEND NOTIFICATION` action from right-side card to avoid split action locations.
   - Add helper copy for `draft` invoices explaining paid action availability after send.

5. **Admin modal body scroll lock (shared)**
   - `src/components/admin/ui/admin-dialog.tsx`
   - Add mount/unmount scroll lock with module-level reference count:
     - first open: set `document.body.style.overflow = "hidden"`, apply scrollbar compensation.
     - final close/unmount: restore prior body styles.
   - Ensure lock is safe with multiple open dialogs.

6. **Single scroll container for booking edit dialog**
   - `src/components/admin/bookings/booking-detail-dialog.tsx`
   - Remove extra `booking-dialog-scroll` wrapper in edit booking dialog.
   - Keep modal header/footer fixed and content scroll inside dialog content region only.

7. **Dialog shell overflow behavior**
   - `src/styles/globals.css`
   - Update `.dialog-panel`/related modal styles to prevent nested scroll jitter.
   - Ensure mobile breakpoints keep usable modal height and internal scroll behavior.

#### Phase 1 Test Plan

##### Automated

- [x] `npm run typecheck`
- [ ] `npm run lint`
- [x] `npm run test:prepare && node ./scripts/run-vitest-with-test-db.cjs run -- admin-invoice-mutations`
- [x] `npm run test:prepare && node ./scripts/run-vitest-with-test-db.cjs run -- admin-invoices`
- [x] `npm run test`

##### Required Test Updates

- `tests/admin-invoice-mutations.test.ts`
  - [x] Add invalid transition assertions (`draft -> mark_paid`, `sent -> mark_unpaid`, `draft -> void`) returning `400`.
  - [x] Assert status remains unchanged on rejected transitions.
- `tests/admin-invoices.test.ts`
  - [x] Update transition assumptions to conform to strict lifecycle rules.
- `tests/invoice-transitions.test.ts` (new)
  - [x] Unit coverage for helper matrix (`allowed`/`disallowed` per action/status).

##### Manual

- [x] `/admin/customers` dialog heading renders exactly `Customer Details:`.
- [x] `/admin/invoices` dialog:
  - `draft`: no `Mark as Paid`, helper copy visible.
  - `sent`: `Mark as Paid` visible and succeeds.
  - `paid`: `Mark as Unpaid` visible and succeeds.
- [x] `/admin/bookings` edit dialog locks background page scroll while open.
- [x] Closing the booking dialog restores page scroll.

## Deviations from Plan

### Phase 1: Admin Dialog Quick Wins and Scroll Lock Foundation
- **Original Plan**: Run and pass `npm run lint` as part of Phase 1 verification.
- **Actual Implementation**: Initial Phase 1 execution encountered unrelated repository lint debt; a follow-up cleanup pass resolved those lint issues.
- **Reason for Deviation**: Baseline lint debt in shared admin hooks/components temporarily blocked a green lint/build pipeline.
- **Impact Assessment**: Deviation is now resolved; `npm run lint` and `npm run build` pass after cleanup.
- **Date/Time**: 2026-03-04 (Australia/Melbourne)

---

## Phase 2: Tooltip System and Coverage Rollout

### Overview

Create one accessible tooltip primitive and apply descriptive tooltips to high-value actions first, then sweep remaining controls.

### Changes Required

#### 1. Shared Tooltip Primitive
**Files**:
- `package.json`
- `src/components/admin/ui/tooltip.tsx` (new)
- `src/styles/globals.css`
**Changes**:
- Add tooltip dependency (Radix tooltip) and create a thin shared wrapper.
- Define tooltip styling tokens consistent with existing theme.
- Ensure keyboard/focus and mobile fallback behavior are usable.

#### 2. Priority Coverage Pass
**Files**:
- `src/components/admin/bookings/bookings-client.tsx`
- `src/components/admin/bookings/booking-detail-dialog.tsx`
- `src/components/admin/invoices/invoices-client.tsx`
- `src/components/admin/customers/customer-table.tsx`
- `src/components/student-portal-client.tsx`
- `src/components/student-materials-client.tsx`
- `src/components/student-login-form.tsx`
- `src/components/booking-form.tsx`
**Changes**:
- Add descriptive tooltips to non-obvious, icon-only, destructive, and workflow-critical controls.
- Replace ambiguous labels with tooltips where labels are intentionally short.
- Keep explicit exceptions documented for obvious controls.

#### 3. Coverage Matrix Documentation
**File**: `Documentation/README.md` (or replacement doc in Phase 3)
**Changes**:
- Add tooltip coverage notes so behavior stays consistent post-refactor.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [ ] Add/update component tests for tooltip rendering on representative controls.

#### Manual Verification
- [x] Tooltips appear on key admin actions (bookings/customers/invoices).
- [x] Tooltips appear on student portal actions with readable copy.
- [ ] Keyboard navigation triggers tooltip visibility where expected.
- [x] No clipped/off-screen tooltip issues at desktop and mobile widths.

---

## Phase 3: Full Manual Rewrite and Legacy Documentation Replacement

### Overview

Rewrite manual content and presentation from scratch, refresh screenshots with Playwright, and safely replace old `Documentation/**` content.

### Changes Required

#### 1. New Manual Content Architecture (Migration-safe)
**Files**:
- `src/lib/manual/content.ts`
- `src/components/admin/manual/manual-client.tsx`
- `src/components/admin/manual/manual-section-client.tsx`
- `src/styles/globals.css`
**Changes**:
- Keep manifest-driven architecture but re-author section corpus completely.
- Align manual component class names with stylesheet (remove class drift).
- Upgrade manual page visual hierarchy (callouts, warnings, procedural blocks, section cards).

#### 2. Replace Legacy Documentation Corpus
**Files**:
- `Documentation/**`
- `README.md`
- `LOCAL-DEVELOPMENT.md` (if docs references change)
**Changes**:
- Replace outdated legacy markdown with rewritten technical manual content.
- Remove stale docs files not used by new manifest and index.
- Update repository-level docs links to new structure.

#### 3. Screenshot Pipeline Refresh
**Files**:
- `tests/e2e/docs-screenshots.spec.ts`
- `scripts/seed-docs-screenshots.ts`
- `scripts/sync-manual-screenshots.cjs`
- `Documentation/assets/README.md`
**Changes**:
- Fix stale selectors/labels in screenshot tests to current UI.
- Capture new screenshot set for rewritten manual.
- Sync screenshots to `public/documentation/screenshots` and ensure manifest references match.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run docs:screenshots`
- [x] `npm run docs:screenshots:sync`
- [x] `npm run build`

#### Manual Verification
- [x] `/admin/manual` displays fully rewritten, visually improved content.
- [x] Legacy/outdated documentation files are removed or replaced per new architecture.
- [x] Screenshot references render correctly in manual sections.
- [x] Manual readability is validated on desktop and mobile.

---

## Phase 4: Student Portal Contract Refactor

### Overview

Centralize student portal API contracts with shared schemas/types and refactor student clients to consume validated data.

### Changes Required

#### 1. Shared Student Portal Contracts
**Files**:
- `src/lib/student-portal/contracts.ts` (new)
- `src/app/api/student/portal/route.ts`
- `src/app/api/student/bookings/route.ts`
- `src/app/api/student/bookings/[id]/route.ts`
**Changes**:
- Define Zod schemas for portal payload, booking request payload, and cancellation response.
- Validate/shape route outputs against shared schemas before response.
- Consolidate duplicate booking/material mappers in portal route into shared helpers.

#### 2. Client Refactor to Shared Types/Validation
**Files**:
- `src/components/student-portal-client.tsx`
- `src/components/student-materials-client.tsx`
**Changes**:
- Remove duplicated inline payload type definitions.
- Replace direct `as PortalPayload` casts with schema-driven parse helpers.
- Keep existing UX behavior (request lesson, cancel booking, materials download).

#### 3. Contract Tests
**Files**:
- `tests/**` (student portal and student API suites)
**Changes**:
- Add/update tests for schema parse success/failure and route/client compatibility.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run test`
- [x] Add/update tests for student portal payload parsing and booking request/cancel flows.

#### Manual Verification
- [x] Student login and session flows remain functional.
- [x] Student portal shows upcoming/previous appointments and materials correctly.
- [x] Student booking request and cancellation continue working with expected notices.

---

## Phase 5: Integrated Verification and Release Hardening

### Overview

Run cross-surface regression checks and complete repo-required docs/env/test synchronization.

### Changes Required

#### 1. Repo Sync Requirements
**Files**:
- `.env.example`
- `.env.test.example`
- `Documentation/**` (or replacement docs)
**Changes**:
- Ensure new/updated config and verification instructions are documented with final behavior.

#### 2. Final Regression Pass
**Files**:
- affected admin/student/manual files from Phases 1-4
**Changes**:
- Address final UI regressions discovered in full-flow testing.
- Ensure no broken manual links or screenshot references remain.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run test`
- [x] `npm run build`

#### Manual Verification
- [x] Admin flows: bookings, customers, invoices, manual pages.
- [x] Student flows: login, portal load, materials actions, booking request/cancel.
- [x] Manual and screenshot assets reflect current UI and workflows.

---

## Testing Strategy

- Unit/contract tests:
  - invoice status-transition action guards,
  - student portal schema parse contracts,
  - tooltip wrapper rendering/accessibility basics.
- Integration/API tests:
  - invoice `mark_paid`/`mark_unpaid` transitions,
  - student booking request/cancel route responses,
  - manual screenshot pipeline selectors.
- E2E/manual checks:
  - booking edit modal scroll lock,
  - invoice dialog payment actions,
  - rewritten manual navigation and screenshot rendering.

## Performance Considerations

- Tooltip components should render lazily and avoid large always-mounted portals on dense pages.
- Student portal contract parsing should be linear and centralized to avoid repeated transform logic.
- Manual pages should keep per-section loading to avoid rendering full corpus at once.

## Migration Notes

- Manual rewrite must be a controlled replacement migration:
  - update manifest/source mapping first,
  - refresh screenshots and link references,
  - remove deprecated docs only after link integrity validation.
- If invoice transition guards are tightened in API, deploy UI and API changes together to avoid transient UX/action mismatch.
- No database migration is required for this plan unless additional contract metadata fields are introduced during implementation.

## References

- Epic Ticket: `thoughts/tickets/feature_admin_ui_polish_manual_rewrite_and_student_portal_sync_epic.md`
- Child Tickets:
  - `thoughts/tickets/bug_admin_customers_dialog_title_customer_details_colon.md`
  - `thoughts/tickets/feature_admin_invoices_dialog_mark_as_paid_action_visibility.md`
  - `thoughts/tickets/bug_admin_bookings_edit_dialog_scroll_lock_and_layout_constraints.md`
  - `thoughts/tickets/feature_ui_tooltips_systemwide_descriptive_coverage.md`
  - `thoughts/tickets/feature_admin_manual_full_rewrite_replace_legacy_documentation.md`
  - `thoughts/tickets/debt_student_portal_refactor_for_admin_api_contract_changes.md`
- Research: `thoughts/research/2026-03-04_admin-ui-polish-manual-rewrite-student-portal-sync-research.md`
