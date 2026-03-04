# Overpass Public Student Admin UI UX Refresh Implementation Plan

## Overview

Implement `FEAT-EPIC: Overpass Brand Refresh and Multi-Surface UI/UX Upgrade` as a coordinated, low-regression rollout across public pages, student login, and admin workflows. The plan prioritizes functional admin blockers first, then shared dialog/tooltip consistency, then visual and content refinements, and finally full-site Playwright verification with manual screenshot recapture.

## Current State Analysis

- Current branch/worktree is heavily dirty with many pre-existing edits across `Documentation/**`, `src/**`, `tests/**`, `package.json`, and `package-lock.json` (verified via `git status --short` during planning).
- Global typography still uses `Sora`/`Space Grotesk`, not Overpass (`src/styles/globals.css:1`, `src/styles/globals.css:41`).
- Public CTA alignment is inconsistent across home/buttons/metrics and route-level button rows (`src/app/page.tsx:52`, `src/app/page.tsx:69`, `src/app/lessons/page.tsx:92`, `src/app/vouchers/page.tsx:68`, `src/app/teacher/page.tsx:74`, `src/app/videos/page.tsx:58`, `src/styles/globals.css:656`, `src/styles/globals.css:663`, `src/styles/globals.css:836`).
- Contact map trigger inherits list-item box styling (`src/app/contact/page.tsx:60`, `src/styles/globals.css:1131`), and terms page still contains literal `...` (`src/app/terms/page.tsx:52`).
- CAPTCHA answer and `New image` controls are stacked, not inline (`src/components/captcha.tsx:194`, `src/components/captcha.tsx:207`).
- Student login credentials layout is uneven (`postcode` compact, `password` full) and hero sizing is special-cased (`src/components/student-login-form.tsx:73`, `src/components/student-login-form.tsx:89`, `src/styles/globals.css:907`).
- Admin dialog layouts remain inconsistent via inline min-height and ad-hoc row structures (`src/components/admin/bookings/booking-detail-dialog.tsx:129`, `src/components/admin/customers/customer-profile-dialog.tsx:136`, `src/components/admin/customers/customer-email-dialog.tsx:27`, `src/components/admin/customers/customer-materials-dialog.tsx:39`).
- Invoice -> customer navigation uses query-driven open state, while customers close flow does not clear query params (`src/components/admin/invoices/invoices-client.tsx:590`, `src/components/admin/customers/customers-client.tsx:121`, `src/components/admin/customers/customers-client.tsx:137`).
- Tooltip content layer is likely too low for modal stacking (`src/styles/globals.css:806`, `src/styles/globals.css:3931`).
- Reports support only one chart renderer (`MiniBarChart`) despite multi-view comparisons (`src/components/admin-reports-client.tsx:193`, `src/components/admin-reports-client.tsx:629`).
- Manual content delivery is mature but tightly coupled to `Documentation/**` markdown and screenshot pipeline (`src/lib/manual/content.ts:195`, `src/lib/manual/content.ts:331`, `tests/e2e/docs-screenshots.spec.ts:55`, `scripts/sync-manual-screenshots.cjs:6`).
- `scripts/test-full-site-local.sh` currently runs unit/integration tests only; Playwright remains separate (`scripts/test-full-site-local.sh:177`, `package.json:17`, `package.json:19`).

## Desired End State

- Overpass is the default UI font across public/student/admin surfaces.
- Requested public page alignments and CAPTCHA layout are consistent and responsive.
- Student login fields and side visual have parity with front-page visual language.
- Admin dialogs (bookings/customers/invoices/public modals) follow one coherent interaction and sizing system.
- Tooltips render reliably in all modal and non-modal contexts.
- Reports console is clearer and supports at least two chart types.
- Manual content is rewritten as an arts-teacher administration guide (task-first, not control-inventory).
- Admin pages have subtle per-page gradients with stronger but readable 3D controls.
- Full-site verification and screenshot recapture are reproducible and documented.

### Key Discoveries

- `src/app/terms/page.tsx:52` - literal placeholder `...` is still rendered.
- `src/components/captcha.tsx:194` - CAPTCHA answer field is not grouped with refresh control.
- `src/components/admin/bookings/booking-detail-dialog.tsx:166` - `Open Customer` currently lives inside customer card, not tab row.
- `src/components/admin/customers/customers-client.tsx:121` - close dialog handler does not clear query params that opened it.
- `src/styles/globals.css:806` + `src/styles/globals.css:3931` - tooltip z-index `90` can lose against modal layer `9999`.
- `src/components/admin-reports-client.tsx:193` - single chart implementation is hardcoded.
- `scripts/test-full-site-local.sh:177` - Playwright is not part of the full-site script path today.

## What We're NOT Doing

- No database schema or Prisma model changes for this epic.
- No redesign of business rules for invoices/bookings beyond requested UI/UX and lifecycle bug fixes.
- No replacement of manual route architecture (`/admin/manual` and `/admin/manual/[sectionId]` remain).
- No broad animation-system rewrite outside required UI consistency/theming updates.

## Implementation Approach

### Design Options Considered

1. **Single mega-pass across all phases/files at once**
   - Pros: fewer merge points.
   - Cons: high risk in dirty worktree, difficult regression isolation.
2. **Worktree-safe incremental phases with strict file targeting** (chosen)
   - Pros: safer with existing edits, easier verification and rollback-by-commit, clearer deviations tracking.
   - Cons: more checkpoints and repeated verification steps.
3. **Freeze/clean branch first, then implement**
   - Pros: cleanest execution surface.
   - Cons: depends on external branch cleanup and blocks delivery momentum.

### Resolved Planning Decisions

- Dialog consistency approach: standardize behavior and tokens through shared dialog classes + `AdminDialog` parity, while adapting existing public modals (`ImageModal`, `VideosGridModal`, manual screenshot modal) instead of a risky wholesale primitive rewrite.
- Tooltip scope: ensure tooltip visibility everywhere tooltips already exist, then add coverage for high-value controls (icon-only, destructive, ambiguous actions) across public/student/admin.
- Full-site verification approach: keep `scripts/test-full-site-local.sh` as environment/setup gate and add an explicit Playwright verification step (optionally script-integrated with a new flag/companion command for repeatability).

### Delivery Order

1. Phase 0 preflight scoping in the dirty worktree.
2. Admin functional blockers and dialog lifecycle stability.
3. Shared dialog/tooltip consistency contracts.
4. Public + student typography/layout updates.
5. Reports/manual/admin thematic refinements.
6. Full-site Playwright verification + screenshot recapture.

## Phase 0: Worktree-Safe Preflight And Scope Lock

### Overview

Prepare safe execution boundaries before code changes so implementation does not trample unrelated pre-existing work.

### Changes Required

#### 1. Scope Snapshot And Target File Contract
**File**: `thoughts/plans/overpass-public-student-admin-ui-ux-refresh-implementation-plan.md`  
**Changes**:
- Capture a preflight snapshot (`git status --short`) for later diff auditing.
- Define touched-file allowlist per phase before editing.
- Explicitly avoid modifying unrelated dirty files in the same directories.

#### 2. Verification Baseline Capture
**File**: n/a (command baseline)  
**Changes**:
- Record baseline results for `npm run typecheck` / `npm run lint` / targeted tests where possible, including known pre-existing failures.
- Use delta-based verification (new failures vs existing failures) during execution.

### Success Criteria

#### Automated Verification
- [ ] Baseline snapshot recorded (`git status --short` and key command outputs).
- [ ] Phase-wise touched-file list established.

#### Manual Verification
- [ ] No unrelated pre-existing dirty files are modified during implementation phases.

## Phase 1: Admin Dialog Blockers And Lifecycle Stability

### Overview

Fix the highest-risk admin issues first: booking edit dialog structure, cross-dialog size consistency, invoice detail usability, and invoice->customer close lifecycle bug.

### Changes Required

#### 1. Booking Detail Dialog Structural Alignment
**File**: `src/components/admin/bookings/booking-detail-dialog.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Move `Open Customer` action onto the same row as `Appointment`/`Communication` tab controls, right-aligned.
- Reposition `Booking is linked to an existing customer` inline with `Customer Details` header area.
- Remove requested redundant helper lines beneath customer details.
- Normalize `Appointment` vs `Communication` panel dimensions using shared class tokens (remove ad-hoc inline sizing where possible).
- Apply differentiated bottom-right action button color hierarchy in communication context (primary/secondary/danger parity with customer details semantics).

#### 2. Customer Dialog Tab Size Uniformity
**File**: `src/components/admin/customers/customer-profile-dialog.tsx`  
**File**: `src/components/admin/customers/customer-email-dialog.tsx`  
**File**: `src/components/admin/customers/customer-materials-dialog.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Replace per-component `minHeight: 650px` inline styles with shared dialog tab height token(s).
- Rework Communication and Learning Materials tab spacing/grouping for better visual hierarchy and task flow.
- Keep Profile & Address, Communication, and Learning Materials on uniform body dimensions.

#### 3. Invoice Detail Dialog UX And Customer Handoff Bug
**File**: `src/components/admin/invoices/invoices-client.tsx`  
**File**: `src/components/admin/customers/customers-client.tsx`  
**Changes**:
- Re-layout invoice detail sections for clearer grouping of identity, line items, lifecycle actions, and PDF/customer actions.
- Keep status transitions aligned with existing shared transition helpers.
- Fix query-param lifecycle by clearing/consuming `customerId/open=true` state when dialog is closed to prevent empty/stuck dialog shell after invoice->customer navigation.
- Add regression-safe open/close sequencing around animated dialog presence.

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Add/update focused tests for invoice->customer query-param dialog open/close behavior.

#### Manual Verification
- [ ] Edit Booking tab row shows Appointment + Communication + far-right Open Customer.
- [ ] Linked-booking status text is inline with customer details header and redundant lines are removed.
- [ ] Booking Appointment and Communication panes share consistent size.
- [ ] Customer Profile/Communication/Learning Materials panes share consistent size.
- [ ] From invoice dialog, `VIEW CUSTOMER` opens customer dialog and `Close` exits cleanly (no empty shell).

---

## Phase 2: Global Dialog System Consistency And Tooltip Reliability

### Overview

Establish one coherent dialog behavior and layering contract across admin/public/student surfaces, and resolve tooltip visibility issues in modal contexts.

### Changes Required

#### 1. Shared Dialog Behavior Contract
**File**: `src/components/admin/ui/admin-dialog.tsx`  
**File**: `src/components/image-modal.tsx`  
**File**: `src/components/videos-grid-modal.tsx`  
**File**: `src/components/admin/manual/manual-section-client.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Align close semantics (header close, backdrop click policy, Escape handling, body scroll lock policy) across modal implementations.
- Normalize panel widths/heights/overflow rules for small/standard/wide dialog variants.
- Standardize footer/action zone spacing and button hierarchy rules.

#### 2. Tooltip Layering And Coverage Pass
**File**: `src/components/admin/ui/tooltip.tsx`  
**File**: `src/styles/globals.css`  
**File Group**: impacted controls in `src/components/admin/**`, `src/components/student-*.tsx`, `src/components/booking-form.tsx`  
**Changes**:
- Raise tooltip layer above dialogs/overlays and validate against portal stacking contexts.
- Preserve existing tooltip API and content text where still accurate.
- Add missing tooltips for high-value controls (icon-only nav/action buttons, destructive actions, non-obvious lifecycle controls).

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

#### Manual Verification
- [ ] Dialog close interactions are consistent across admin, image modal, videos modal, and manual screenshot modal.
- [ ] Tooltips are visible in booking/customer/invoice dialogs and on public/student controls.
- [ ] No tooltip clipping behind overlays or scroll containers.

---

## Phase 3: Public Surface Overpass Migration And Layout Alignment

### Overview

Complete the public-facing request set: font migration, CTA/box justification, contact/terms fixes, and CAPTCHA inline controls.

### Changes Required

#### 1. Global Typography Migration
**File**: `src/styles/globals.css`  
**Changes**:
- Replace Google font import and default body/ui stack with `Overpass`.
- Keep specialty stacks (e.g. monospace/code) unchanged unless required.
- Validate headings/metrics readability after font change.

#### 2. Public CTA/Card Alignment Standardization
**File**: `src/app/page.tsx`  
**File**: `src/app/lessons/page.tsx`  
**File**: `src/app/vouchers/page.tsx`  
**File**: `src/app/teacher/page.tsx`  
**File**: `src/app/videos/page.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Apply equal visual justification for home action trio and home metric trio.
- Apply balanced two-button justification for lessons, vouchers, teacher, videos, and terms bottom rows.
- Use shared utility classes/tokens to prevent per-page drift.

#### 3. Contact + Terms + CAPTCHA UX Fixes
**File**: `src/app/contact/page.tsx`  
**File**: `src/app/terms/page.tsx`  
**File**: `src/components/captcha.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Center Google maps location button and remove surrounding list-box treatment artifact.
- Remove literal `...` on terms page.
- Render CAPTCHA answer input and `New image` button inline on desktop, stacked on narrow mobile widths.

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

#### Manual Verification
- [ ] Public pages render with Overpass.
- [ ] Home three buttons and three metric boxes are visually justified.
- [ ] Lessons/vouchers/teacher/videos/terms CTA pairs are justified.
- [ ] Contact map button is centered with no surrounding list-style box.
- [ ] CAPTCHA input + refresh button are inline on desktop and usable on mobile.

---

## Phase 4: Student Login Layout And Visual Parity

### Overview

Improve student login form ergonomics and visual parity with front-page side image behavior.

### Changes Required

#### 1. Credential Row Pairing
**File**: `src/components/student-login-form.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Place postcode and password on same row at desktop/tablet breakpoints.
- Preserve vertical stacking and readable focus order on mobile.

#### 2. Side Visual Size Parity
**File**: `src/app/student/login/page.tsx`  
**File**: `src/components/panel-layout.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Align student side visual size rules with front-page visual behavior.
- Remove disproportionate overrides causing mismatch.

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

#### Manual Verification
- [ ] Student postcode/password fields are same-row on desktop/tablet.
- [ ] Mobile stacking remains clean and accessible.
- [ ] Student side image proportions match other front pages.

---

## Phase 5: Reports Console UX Upgrade And Multi-Chart Support

### Overview

Restructure reports for easier scanning and add chart-type switching without breaking current API contracts.

### Changes Required

#### 1. Information Architecture And Readability Improvements
**File**: `src/components/admin-reports-client.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Separate toolbar, controls, KPI summaries, comparisons, and trends more clearly.
- Improve metric typography/spacing/legend readability for business operations use.

#### 2. Multi-Chart Support
**File**: `src/components/admin-reports-client.tsx`  
**Changes**:
- Add chart type selector with at least Bar + Line modes (optional Area mode if low-risk).
- Reuse existing trend data and keep comparison toggles functioning.

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

#### Manual Verification
- [ ] Reports page is easier to scan for operational decisions.
- [ ] Chart type can be switched without data/interaction regressions.
- [ ] Custom range and report email actions still work.

---

## Phase 6: Manual Rewrite As Arts Teaching Administration Guide

### Overview

Rewrite manual content and fine-tune manual UX to present workflow-first operational guidance for arts teachers.

### Changes Required

#### 1. Content Rewrite And Information Architecture
**File Group**: `Documentation/*.md` in `MANUAL_SECTION_MANIFEST`  
**File**: `src/lib/manual/content.ts` (if section titles/summaries/routes need updates)  
**Changes**:
- Rewrite sections in teaching administration voice (daily operations, lesson lifecycle, invoicing follow-up, communication cadence, troubleshooting).
- Avoid exhaustive control-by-control descriptions; emphasize procedures, decisions, and exceptions.
- Keep route mapping and screenshot IDs accurate.

#### 2. Manual UI Readability Enhancements
**File**: `src/components/admin/manual/manual-client.tsx`  
**File**: `src/components/admin/manual/manual-section-client.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Improve hierarchy with callouts, checklists, quick links, and clearer section framing.
- Keep `/admin/manual` and `/admin/manual/[sectionId]` behavior intact.

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

#### Manual Verification
- [ ] Manual reads as workflow-oriented guide for arts teachers.
- [ ] Navigation and section rendering remain stable.
- [ ] Screenshot references and captions remain accurate.

---

## Phase 7: Admin Per-Page Gradients And Enhanced 3D Controls

### Overview

Introduce subtle page-specific admin gradients and stronger, consistent control depth while preserving readability.

### Changes Required

#### 1. Page-Scoped Admin Themes
**File**: `src/components/admin/layout/admin-shell.tsx`  
**File Group**: admin page clients (`bookings-client`, `customers-client`, `invoices-client`, `admin-reports-client`, `settings-client`, manual clients)  
**File**: `src/styles/globals.css`  
**Changes**:
- Add per-page shell class usage and define coherent gradient variants.
- Keep manual variant behavior intact while aligning with overall theme system.

#### 2. 3D Button And Control Depth Pass
**File**: `src/styles/globals.css`  
**File Group**: shared admin UI primitives/components (`admin-form`, `admin-table`, cards/action bars as needed)  
**Changes**:
- Strengthen button default/hover/active depth and state clarity.
- Ensure lists/tables/forms visually match the upgraded button language.

### Success Criteria

#### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

#### Manual Verification
- [ ] Each admin page has a subtle but distinct gradient.
- [ ] Buttons have stronger 3D affordance without harming contrast/readability.
- [ ] Lists/tables/forms remain visually coherent and usable.

---

## Phase 8: Playwright Verification Gate And Screenshot Recapture

### Overview

Implement the closure gate child ticket for full-site validation and updated manual screenshots.

### Changes Required

#### 1. Verification Workflow Hardening
**File**: `scripts/test-full-site-local.sh` (optional enhancement)  
**File**: `package.json`  
**File Group**: `tests/e2e/**` (add full-site smoke spec if coverage gaps remain)  
**Changes**:
- Keep `scripts/test-full-site-local.sh` as environment setup/test gate.
- Add reproducible Playwright step in local workflow (`npm run test:e2e` and/or scripted flag/wrapper).
- Ensure admin and student test-data setup instructions are explicit:
  - admin: `admin@example.com` / `admin123`
  - student: create customer and generate portal password.

#### 2. Manual Screenshot Recapture
**File**: `tests/e2e/docs-screenshots.spec.ts`  
**File**: `scripts/sync-manual-screenshots.cjs`  
**File Group**: `Documentation/assets/**`, `public/documentation/screenshots/**`  
**Changes**:
- Recapture screenshots with Playwright against updated UI.
- Sync screenshot assets and verify manual rendering paths.

### Success Criteria

#### Automated Verification
- [ ] `scripts/test-full-site-local.sh --seed --no-start`
- [ ] `npm run test:e2e`
- [ ] `npm run docs:screenshots`
- [ ] `npm run docs:screenshots:sync`
- [ ] `npm run typecheck`
- [ ] `npm run lint` (or document pre-existing lint debt if unrelated)

#### Manual Verification
- [ ] Admin login works with `admin@example.com` / `admin123`.
- [ ] Student login works with generated password from new customer.
- [ ] Public/student/admin critical route smoke checks pass.
- [ ] `/admin/manual` displays refreshed screenshots correctly.

---

## Testing Strategy

- Unit/integration:
  - Keep existing Vitest coverage green for bookings/customers/invoices/student portal.
  - Add focused tests for query-param dialog lifecycle and any extracted helpers.
- UI/component behavior:
  - Validate dialog open/close/escape/backdrop consistency and tooltip visibility in layered contexts.
  - Validate responsive behavior for public CTA rows, CAPTCHA inline group, and student login row pairing.
- End-to-end:
  - Run Playwright smoke coverage for key public/admin/student paths.
  - Run docs screenshot capture and sync as release artifact validation.
- Regression sequencing:
  - After each phase, run `typecheck` and phase-targeted tests before moving to next phase.

## Performance Considerations

- Avoid expensive re-renders in reports chart mode switching by memoizing transformed trend datasets.
- Prefer CSS token/class consolidation over runtime layout calculations for dialog and page alignment consistency.
- Keep modal/tooltip layering changes CSS-driven to reduce JS complexity and event overhead.

## Migration Notes

- No DB migration required.
- Update docs/test runbook for the new verification gate (script + Playwright + screenshot sync).
- If local verification scripting is enhanced, keep backward-compatible defaults (`--seed`, `--no-start`, current behavior).
- Ensure `.env.example`/manual verification checklist updates are included when workflow assumptions change.

## References

- Ticket: `thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md`
- Child Tickets:
  - `thoughts/tickets/feature_global_overpass_and_public_layout_alignment_polish.md`
  - `thoughts/tickets/feature_student_login_layout_alignment_and_visual_parity.md`
  - `thoughts/tickets/bug_admin_dialog_consistency_invoice_customer_navigation_and_layout.md`
  - `thoughts/tickets/feature_global_dialog_system_consistency_across_public_student_admin.md`
  - `thoughts/tickets/bug_tooltip_visibility_and_layering_regression.md`
  - `thoughts/tickets/feature_admin_reports_console_readability_and_multi_chart_upgrade.md`
  - `thoughts/tickets/feature_admin_manual_rewrite_as_arts_teaching_operations_guide.md`
  - `thoughts/tickets/feature_admin_page_specific_gradients_and_enhanced_3d_controls.md`
  - `thoughts/tickets/debt_playwright_full_site_local_verification_and_manual_screenshot_recapture.md`
- Research: `thoughts/research/2026-03-04_overpass-public-student-admin-ui-ux-refresh-research.md`
