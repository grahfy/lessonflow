# Overpass Epic All Attached Child Tickets Implementation Plan

## Overview

Create one executable plan that covers every child ticket attached to `feature_epic_overpass_public_student_admin_ui_ux_refresh.md`, with dependency-aware sequencing, verification gates, and worktree-safe execution constraints.

## Current State Analysis

- Parent epic is already `planned` (`thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md:5`), and attached child tickets are now aligned to `planned` status in this planning pass.
- Epic scope spans public typography/layout, student login UI parity, admin dialog reliability/consistency, tooltip layering, reports UX/charts, manual rewrite, admin theming, and Playwright closeout.
- Current branch/worktree is heavily dirty across `src/**`, `Documentation/**`, `tests/**`, and tooling files; execution must be scoped to planned files only.
- Research confirms key technical constraints:
  - Font stack still Sora/Space Grotesk (`src/styles/globals.css:1`, `src/styles/globals.css:41`).
  - Terms page contains literal `...` (`src/app/terms/page.tsx:52`).
  - CAPTCHA input + refresh are not inline (`src/components/captcha.tsx:194`, `src/components/captcha.tsx:207`).
  - Invoice -> customer dialog lifecycle issue is query-param related (`src/components/admin/invoices/invoices-client.tsx:590`, `src/components/admin/customers/customers-client.tsx:121`).
  - Tooltip z-index is likely too low for modal overlays (`src/styles/globals.css:806`, `src/styles/globals.css:3931`).
  - Reports currently support a single chart renderer (`src/components/admin-reports-client.tsx:193`).
  - `scripts/test-full-site-local.sh` does not run Playwright (`scripts/test-full-site-local.sh:177`).

## Desired End State

- All attached child tickets are planned and executable in a clear dependency order.
- Each child ticket has phase-level implementation targets and explicit automated/manual success criteria.
- No unresolved planning questions remain before execution.
- Execution path is safe for current dirty worktree and includes final Playwright/manual screenshot closeout.

### Key Discoveries

- `thoughts/tickets/feature_global_overpass_and_public_layout_alignment_polish.md:5` - status aligned to `planned`.
- `thoughts/tickets/feature_student_login_layout_alignment_and_visual_parity.md:5` - status aligned to `planned`.
- `thoughts/tickets/bug_admin_dialog_consistency_invoice_customer_navigation_and_layout.md:5` - status aligned to `planned`.
- `thoughts/tickets/feature_global_dialog_system_consistency_across_public_student_admin.md:5` - status aligned to `planned`.
- `thoughts/tickets/bug_tooltip_visibility_and_layering_regression.md:5` - status aligned to `planned`.
- `thoughts/tickets/feature_admin_reports_console_readability_and_multi_chart_upgrade.md:5` - status aligned to `planned`.
- `thoughts/tickets/feature_admin_manual_rewrite_as_arts_teaching_operations_guide.md:5` - status aligned to `planned`.
- `thoughts/tickets/feature_admin_page_specific_gradients_and_enhanced_3d_controls.md:5` - status aligned to `planned`.
- `thoughts/tickets/debt_playwright_full_site_local_verification_and_manual_screenshot_recapture.md:5` - status aligned to `planned`.

## What We're NOT Doing

- No schema migrations or API domain changes beyond UI/UX bug scope in attached tickets.
- No unrelated cleanup of pre-existing dirty files.
- No broad redesign outside requested epic scope.
- No unresolved exploratory spikes during implementation phases.

## Implementation Approach

### Design Options Considered

1. Single-pass implementation of all child tickets in one change set.
   - Rejected: high regression and review risk, especially in current dirty worktree.
2. Child-ticket phased execution with dependency order and per-phase verification (chosen).
   - Chosen for safer incremental delivery and easier rollback/debug.
3. Pause for full branch cleanup before planning.
   - Rejected for now; planning can proceed with explicit preflight safety gate.

### Resolved Decisions

- Modal consistency will be delivered by converging behavior/classes around current primitives (`AdminDialog` + existing public/manual modals), not by rewriting to a new modal system.
- Tooltip rollout scope is “all currently tooltip-enabled controls + high-value missing controls” for this epic.
- Playwright closeout remains explicit as a final gate, even if `scripts/test-full-site-local.sh` is not expanded to include e2e by default.

### Execution Order (Child-Ticket Coverage)

1. `BUG` admin dialog consistency + invoice->customer regression.
2. `FEAT` global dialog system consistency.
3. `BUG` tooltip visibility/layering.
4. `FEAT` public Overpass + alignment/captcha/terms/contact fixes.
5. `FEAT` student login field/visual parity.
6. `FEAT` reports console UX + multi-chart support.
7. `FEAT` admin manual rewrite as arts-teaching operations guide.
8. `FEAT` admin per-page gradients + enhanced 3D controls.
9. `DEBT` full-site Playwright verification + screenshot recapture.

## Phase 0: Worktree-Safe Preflight

### Overview

Create execution safety boundaries before touching code.

### Changes Required

#### 1. Baseline and Scope Lock
**File**: `thoughts/plans/overpass-epic-all-attached-child-tickets-implementation-plan.md`  
**Changes**:
- Record `git status --short` baseline and command baseline (`typecheck`, `lint`, selected tests).
- Define per-phase touched-file allowlist and avoid unrelated edits.

### Success Criteria

#### Automated Verification
- [x] Baseline recorded for `git status --short`, `npm run typecheck`, `npm run lint`.

#### Manual Verification
- [x] Implementation phases do not modify unrelated dirty files.

---

## Phase 1: Child Ticket `bug_admin_dialog_consistency_invoice_customer_navigation_and_layout`

### Overview

Fix blocking admin dialog layout and invoice->customer close lifecycle regression first.

### Changes Required

#### 1. Booking/Customer/Invoice Dialog Layout Reliability
**File**: `src/components/admin/bookings/booking-detail-dialog.tsx`  
**File**: `src/components/admin/customers/customer-profile-dialog.tsx`  
**File**: `src/components/admin/customers/customer-email-dialog.tsx`  
**File**: `src/components/admin/customers/customer-materials-dialog.tsx`  
**File**: `src/components/admin/invoices/invoices-client.tsx`  
**File**: `src/components/admin/customers/customers-client.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Align booking tabs + open customer CTA row placement.
- Remove redundant helper text lines and unify tab body dimensions.
- Improve communication/material tab spacing and control hierarchy.
- Fix query-param dialog close lifecycle for invoice->customer handoff.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] Focused tests for invoice->customer dialog lifecycle behavior.

#### Manual Verification
- [x] All acceptance criteria in child ticket pass.

---

## Phase 2: Child Ticket `feature_global_dialog_system_consistency_across_public_student_admin`

### Overview

Standardize dialog interaction and layout contracts across admin/public/student surfaces.

### Changes Required

#### 1. Cross-Surface Dialog Contract
**File**: `src/components/admin/ui/admin-dialog.tsx`  
**File**: `src/components/image-modal.tsx`  
**File**: `src/components/videos-grid-modal.tsx`  
**File**: `src/components/admin/manual/manual-section-client.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Harmonize close affordances, Escape behavior, backdrop policy, sizing classes, and action hierarchy.
- Ensure loading/error/empty state consistency in dialog bodies.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`

#### Manual Verification
- [x] All acceptance criteria in child ticket pass.

---

## Phase 3: Child Ticket `bug_tooltip_visibility_and_layering_regression`

### Overview

Fix tooltip layering and visibility across dialogs and page surfaces.

### Changes Required

#### 1. Tooltip Layer and Coverage Pass
**File**: `src/components/admin/ui/tooltip.tsx`  
**File**: `src/styles/globals.css`  
**File Group**: tooltip call sites in `src/components/admin/**`, `src/components/student-*.tsx`, `src/components/booking-form.tsx`  
**Changes**:
- Adjust portal/layering strategy and z-index tokenization.
- Validate no clipping in scroll containers or overlays.
- Fill missing high-value tooltips where ambiguity exists.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`

#### Manual Verification
- [x] All acceptance criteria in child ticket pass.

---

## Phase 4: Child Ticket `feature_global_overpass_and_public_layout_alignment_polish`

### Overview

Apply Overpass and complete all public-facing alignment/presentation fixes.

### Changes Required

#### 1. Typography + Public Alignment
**File**: `src/styles/globals.css`  
**File**: `src/app/page.tsx`  
**File**: `src/app/lessons/page.tsx`  
**File**: `src/app/vouchers/page.tsx`  
**File**: `src/app/teacher/page.tsx`  
**File**: `src/app/videos/page.tsx`  
**File**: `src/app/contact/page.tsx`  
**File**: `src/app/terms/page.tsx`  
**File**: `src/components/captcha.tsx`  
**Changes**:
- Migrate font stack to Overpass implementation approach selected for app.
- Justify requested button rows and home metric cards.
- Center contact map button and remove surrounding box artifact.
- Remove terms `...` placeholder.
- Inline CAPTCHA input + new-image button on desktop with mobile fallback stacking.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`

#### Manual Verification
- [x] All acceptance criteria in child ticket pass.

---

## Phase 5: Child Ticket `feature_student_login_layout_alignment_and_visual_parity`

### Overview

Align student login credentials row and side visual proportions.

### Changes Required

#### 1. Form + Visual Parity
**File**: `src/components/student-login-form.tsx`  
**File**: `src/app/student/login/page.tsx`  
**File**: `src/components/panel-layout.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Place postcode/password on same row at desktop/tablet.
- Maintain mobile stacking and accessibility.
- Harmonize side visual sizing with other front-page visual proportions.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`

#### Manual Verification
- [x] All acceptance criteria in child ticket pass.

---

## Phase 6: Child Ticket `feature_admin_reports_console_readability_and_multi_chart_upgrade`

### Overview

Improve reports information architecture and add chart-type switching.

### Changes Required

#### 1. Reports IA + Multi-Chart
**File**: `src/components/admin-reports-client.tsx`  
**File**: `src/styles/globals.css`  
**File**: `src/app/api/admin/reports/route.ts` (only if contract adaptation is needed)  
**Changes**:
- Rework control/KPI/comparison/trend visual hierarchy.
- Add at least bar + line chart modes.
- Preserve current filters, range behavior, and email actions.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`

#### Manual Verification
- [x] All acceptance criteria in child ticket pass.

---

## Phase 7: Child Ticket `feature_admin_manual_rewrite_as_arts_teaching_operations_guide`

### Overview

Rewrite manual content and supporting manual UI framing for workflow-first operations.

### Changes Required

#### 1. Manual Content + Structure Refresh
**File Group**: `Documentation/*.md` referenced by manifest  
**File**: `src/lib/manual/content.ts`  
**File**: `src/components/admin/manual/manual-client.tsx`  
**File**: `src/components/admin/manual/manual-section-client.tsx`  
**File**: `src/styles/globals.css`  
**Changes**:
- Rewrite docs for arts teaching administration workflow style.
- Improve navigation/readability without control-by-control inventory style.
- Keep section routing and screenshot mappings correct.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`

#### Manual Verification
- [x] All acceptance criteria in child ticket pass.

---

## Phase 8: Child Ticket `feature_admin_page_specific_gradients_and_enhanced_3d_controls`

### Overview

Apply subtle per-page admin gradients and stronger 3D control styling.

### Changes Required

#### 1. Admin Theme Variants
**File**: `src/components/admin/layout/admin-shell.tsx`  
**File Group**: admin page clients using `AdminShell`  
**File**: `src/styles/globals.css`  
**Changes**:
- Add page-specific shell class mapping.
- Define coherent gradient token system and enhanced button/control depth states.
- Keep readability and semantic button colors intact.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`
- [x] `npm run lint`

#### Manual Verification
- [x] All acceptance criteria in child ticket pass.

---

## Phase 9: Child Ticket `debt_playwright_full_site_local_verification_and_manual_screenshot_recapture`

### Overview

Run final verification gate and regenerate manual screenshots.

### Changes Required

#### 1. Full-Site Verification + Screenshot Pipeline
**File**: `scripts/test-full-site-local.sh` (if workflow flagging needed)  
**File**: `tests/e2e/docs-screenshots.spec.ts`  
**File**: `scripts/sync-manual-screenshots.cjs`  
**File**: `package.json` (if helper script adjustment needed)  
**File Group**: `Documentation/assets/**`, `public/documentation/screenshots/**`  
**Changes**:
- Execute full verification workflow using provided admin credentials and generated student portal credentials.
- Run screenshot capture + sync and verify `/admin/manual` rendering.

### Success Criteria

#### Automated Verification
- [x] `scripts/test-full-site-local.sh --seed --no-start`
- [x] `npm run test:e2e`
- [x] `npm run docs:screenshots`
- [x] `npm run docs:screenshots:sync`
- [x] `npm run typecheck`
- [x] `npm run lint` (or documented pre-existing lint debt)

#### Manual Verification
- [x] All acceptance criteria in child ticket pass.

---

## Testing Strategy

- Phase-level checks:
  - Run `typecheck` after each phase.
  - Run lint at natural integration points (Phase 3, 6, 9) and track delta vs baseline.
- Targeted behavioral tests:
  - Dialog lifecycle tests (invoice->customer close path).
  - Tooltip visibility checks in modal + non-modal surfaces.
  - Reports chart mode switching and filter regression checks.
- End-to-end closure:
  - Public + student + admin smoke via Playwright.
  - Manual screenshot pipeline verification and rendered manual validation.

## Performance Considerations

- Prefer CSS token consolidation over runtime layout recalculation.
- Keep report chart switching memoized and avoid unnecessary full rerenders.
- Preserve modal/tooltip portal efficiency and avoid event listener churn.

## Migration Notes

- No schema migration required.
- Update docs/runbook instructions if verification scripts are extended.
- Keep test credentials local-only and do not persist sensitive values beyond approved fixtures/env files.

## References

- Parent Epic: `thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md`
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
- Research:
  - `thoughts/research/2026-03-04_overpass-public-student-admin-ui-ux-refresh-research.md`

## Deviations from Plan

### Phase 9: Full-Site Verification + Screenshot Pipeline
- **Original Plan**: Run `scripts/test-full-site-local.sh --seed --no-start` plus Playwright/manual screenshot recapture commands.
- **Actual Implementation**: Attempted to run `scripts/test-full-site-local.sh --seed --no-start --skip-install`, but execution stopped immediately because Docker was not running in the local environment.
- **Reason for Deviation**: Required local Docker runtime is unavailable.
- **Impact Assessment**: Code changes were verified with `npm run typecheck` and `npm run lint`, but end-to-end/local-seeded verification and screenshot recapture remain pending until Docker is available.
- **Date/Time**: 2026-03-04

### Phase 9: Full-Site Verification + Screenshot Pipeline (Follow-up Execution)
- **Original Plan**: Complete all pending full-site and screenshot verification gates, including generated student portal credentials.
- **Actual Implementation**: Ran `scripts/test-full-site-local.sh --seed --skip-install` (tests + local dev server), created a new customer through admin APIs, revealed generated portal password, ran `npm run test:e2e`, `npm run docs:screenshots`, and `npm run docs:screenshots:sync`, then confirmed `npm run typecheck` and `npm run lint`.
- **Reason for Deviation**: Used `--seed --skip-install` start mode instead of the original `--seed --no-start` mode so the server remained available for screenshot capture in the same execution pass.
- **Impact Assessment**: Verification objective achieved; all Phase 9 success criteria are now satisfied.
- **Date/Time**: 2026-03-04
