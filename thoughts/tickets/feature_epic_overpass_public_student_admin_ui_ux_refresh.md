---
type: feature
priority: high
created: 2026-03-04
status: implemented
tags: [epic, public, student, admin, ui, ux, typography, dialogs, reports, manual, playwright, verification]
keywords: [overpass font migration, public page button justification, captcha inline controls, student login layout parity, admin dialog consistency, global dialog consistency, tooltip visibility regression, reports ui ux upgrade, manual rewrite arts teacher, admin gradients 3d buttons, playwright full site validation, manual screenshot recapture]
patterns: [src/styles/globals.css, src/app/page.tsx, src/app/lessons/page.tsx, src/app/vouchers/page.tsx, src/app/teacher/page.tsx, src/app/videos/page.tsx, src/app/contact/page.tsx, src/app/terms/page.tsx, src/components/captcha.tsx, src/app/student/login/page.tsx, src/components/student-login-form.tsx, src/components/admin/bookings/booking-detail-dialog.tsx, src/components/admin/customers/customer-dialog-wrapper.tsx, src/components/admin/invoices/invoices-client.tsx, src/components/admin-reports-client.tsx, src/components/admin/manual/**, src/components/image-modal.tsx, src/components/videos-grid-modal.tsx, src/components/admin/ui/admin-dialog.tsx, src/lib/manual/content.ts, thoughts/tickets/**]
---

# FEAT-EPIC: Overpass Brand Refresh and Multi-Surface UI/UX Upgrade

## Description

Deliver a coordinated visual and workflow refresh across public pages, student portal login, and admin interfaces. This includes a global typography migration to Google Font Overpass, button/layout alignment fixes, dialog consistency improvements, reports UX expansion, and a rewritten manual focused on arts-teaching administration workflows.

## Context

The request combines design-system changes, page-level layout corrections, dialog usability fixes, a known admin navigation bug, and content architecture updates. The scope is too large for one atomic ticket and must be split into independently verifiable child tickets.

## Requirements

### Functional Requirements
- Track and deliver all requested UI/UX updates via child tickets with clear ownership boundaries.
- Ensure every user-requested item is mapped to at least one child ticket.
- Preserve existing route behavior and data integrity while adjusting layout and visual treatments.
- Ensure all UI dialog boxes use a consistent interaction and visual system across public, student, and admin surfaces.
- Fix tooltip visibility so tooltips appear reliably wherever tooltip affordances are used.
- Run a full-site Playwright verification pass via `scripts/test-full-site-local.sh` after implementation and recapture admin manual screenshots.

### Non-Functional Requirements
- Keep each child ticket independently testable.
- Prevent regressions in admin workflows (bookings/customers/invoices/reports/manual).
- Keep public and admin theming cohesive while avoiding oversaturated gradients.

## Current State

- Public pages and admin pages already use gradient-based themes but not the requested typography and alignment standards.
- Admin dialogs have partial sizing/layout standardization but still contain consistency and navigation defects.
- Reports and manual exist, but requested UX/content direction requires a substantial restructuring pass.

## Desired State

A split implementation queue where each scoped ticket can be researched, planned, implemented, and verified independently while still delivering one coherent redesign outcome.

## Research Context

### Keywords to Search
- `overpass font globals css` - find and replace current typography sources and fallbacks.
- `button-row justify` - standardize CTA alignment behavior across public pages.
- `captcha field layout` - convert captcha input + refresh button to inline control group.
- `booking detail dialog tab sizing` - unify admin tab/dialog dimensions and action layout.
- `invoice dialog view customer routing` - fix cross-page dialog ownership/close behavior.
- `reports chart type toggle` - add multiple chart representations.
- `manual information architecture` - move from paragraph-heavy docs to task-based guide format.
- `admin shell per-page gradients` - apply subtle page-specific gradient tokens.

### Patterns to Investigate
- `src/components/panel-layout.tsx`
- `src/components/admin/layout/admin-shell.tsx`
- `src/components/admin/ui/admin-dialog.tsx`
- `src/styles/globals.css`
- `src/components/admin-reports-client.tsx`
- `src/components/admin/manual/manual-client.tsx`
- `src/lib/manual/content.ts`

### Key Decisions Made
- This work is split into ten child tickets to maintain atomic implementation and reviewability.
- Dialog behavior fixes (including invoice->customer bug) are isolated from purely visual theming changes.
- Manual rewrite remains task-based and operator-focused instead of documenting every control one-by-one.

## Success Criteria

### Automated Verification
- [x] Each child ticket defines and runs relevant `typecheck`/`lint`/targeted tests.
- [x] No new failing tests introduced in touched areas.

### Manual Verification
- [x] All requested public, student, and admin UX items are mapped and accepted via child-ticket checklists.
- [x] No unresolved request items remain outside tracked scope.

## Related Information

- Child ticket: `thoughts/tickets/feature_global_overpass_and_public_layout_alignment_polish.md`
- Child ticket: `thoughts/tickets/feature_student_login_layout_alignment_and_visual_parity.md`
- Child ticket: `thoughts/tickets/bug_admin_dialog_consistency_invoice_customer_navigation_and_layout.md`
- Child ticket: `thoughts/tickets/feature_global_dialog_system_consistency_across_public_student_admin.md`
- Child ticket: `thoughts/tickets/bug_tooltip_visibility_and_layering_regression.md`
- Child ticket: `thoughts/tickets/feature_admin_reports_console_readability_and_multi_chart_upgrade.md`
- Child ticket: `thoughts/tickets/feature_admin_manual_rewrite_as_arts_teaching_operations_guide.md`
- Child ticket: `thoughts/tickets/feature_admin_page_specific_gradients_and_enhanced_3d_controls.md`
- Child ticket: `thoughts/tickets/debt_playwright_full_site_local_verification_and_manual_screenshot_recapture.md`
- Child ticket: `thoughts/tickets/debt_overpass_epic_child_ticket_orchestration_and_tracking.md`

## Notes

- Implementation order should prioritize bug fixes in admin dialogs before broad visual refinements.
