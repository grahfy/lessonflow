---
type: feature
priority: high
created: 2026-03-04
status: implemented
tags: [admin, customers, bookings, invoices, tooltips, manual, documentation, student-portal, epic]
keywords: [customer details title colon, invoice dialog mark as paid, edit booking dialog scroll lock, descriptive tooltips all ui options, rewrite manual from scratch, remove old documentation folder, student portal refactor for admin api changes]
patterns: [thoughts/tickets/bug_admin_customers_dialog_title_customer_details_colon.md, thoughts/tickets/feature_admin_invoices_dialog_mark_as_paid_action_visibility.md, thoughts/tickets/bug_admin_bookings_edit_dialog_scroll_lock_and_layout_constraints.md, thoughts/tickets/feature_ui_tooltips_systemwide_descriptive_coverage.md, thoughts/tickets/feature_admin_manual_full_rewrite_replace_legacy_documentation.md, thoughts/tickets/debt_student_portal_refactor_for_admin_api_contract_changes.md]
---

# FEAT-EPIC: Admin UI Polish, Manual Rebuild, and Student Portal Contract Sync

## Description

Coordinate the requested UX and documentation overhaul across admin dialogs, global tooltip behavior, full manual rewrite, and student portal refactor driven by admin/API contract changes.

## Context

The request spans six distinct surfaces with different risk profiles: small UI text fix, invoice lifecycle action visibility, modal scroll locking, cross-app tooltip standards, documentation system rewrite, and student portal contract alignment. Keeping these as child tickets allows parallel implementation and controlled regression testing.

## Requirements

### Functional Requirements
- Track and deliver each child ticket as an independently testable unit.
- Keep shared UI behavior consistent where common components are touched.
- Ensure documentation rewrite and student portal refactor include environment/test updates in the same change set.

### Non-Functional Requirements
- Avoid mixing unrelated implementation concerns into one large PR.
- Preserve existing auth boundaries for admin and student surfaces.
- Require explicit verification checklists per child ticket.

## Current State

There is prior ticketing for related dialog/manual work, but this request introduces additional explicit requirements and broader scope (full rewrite + removal of legacy docs + API-driven portal refactor).

## Desired State

A coordinated execution path with clear boundaries, child-ticket ownership, and verifiable outcomes for each requested change.

## Research Context

### Keywords to Search
- `admin dialog UX regressions` - identify shared modal behavior points.
- `manual content source of truth` - define how rewritten docs map to in-app manual.
- `student portal contract drift` - map data shape differences and duplicated types.

### Patterns to Investigate
- `src/components/admin/ui/admin-dialog.tsx` shared dialog layout/scroll behavior.
- `src/components/admin/manual/**` and `src/lib/manual/content.ts` manual rendering/data pipeline.
- `src/components/student-portal-client.tsx` and `src/app/api/student/**` portal contract paths.

### Key Decisions Made
- Scope is split into six atomic child tickets.
- Tooltip work is treated as design-system behavior, not ad-hoc per page.
- Manual rewrite includes replacing old `Documentation/**` content, not incremental edits.
- Student portal contract refactor is treated as technical debt with functional validation.

## Success Criteria

### Automated Verification
- [ ] Child tickets each define and pass their own automated checks.
- [x] `npm run typecheck`
- [x] `npm run lint`

### Manual Verification
- [x] All six requested outcomes are validated against child-ticket checklists.
- [x] Cross-page regressions are checked on admin + student surfaces.

## Related Information

- `thoughts/tickets/bug_admin_customers_dialog_title_customer_details_colon.md`
- `thoughts/tickets/feature_admin_invoices_dialog_mark_as_paid_action_visibility.md`
- `thoughts/tickets/bug_admin_bookings_edit_dialog_scroll_lock_and_layout_constraints.md`
- `thoughts/tickets/feature_ui_tooltips_systemwide_descriptive_coverage.md`
- `thoughts/tickets/feature_admin_manual_full_rewrite_replace_legacy_documentation.md`
- `thoughts/tickets/debt_student_portal_refactor_for_admin_api_contract_changes.md`

## Notes

- Existing implemented tickets around dialog sizing/scrolling/manual are related but not sufficient to satisfy this request verbatim.
- Execute child tickets in this order: small admin fixes -> tooltip system -> manual rewrite -> student portal contract refactor.
