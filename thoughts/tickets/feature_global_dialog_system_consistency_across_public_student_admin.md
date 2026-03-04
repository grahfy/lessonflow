---
type: feature
priority: high
created: 2026-03-04
status: implemented
tags: [ui, ux, dialogs, design-system, public, student, admin]
keywords: [all ui dialog boxes consistent, modal consistency across app, unified dialog spacing sizing actions, shared dialog tokens]
patterns: [src/components/admin/ui/admin-dialog.tsx, src/components/image-modal.tsx, src/components/videos-grid-modal.tsx, src/components/admin/bookings/booking-detail-dialog.tsx, src/components/admin/customers/customer-dialog-wrapper.tsx, src/components/admin/invoices/invoices-client.tsx, src/styles/globals.css]
---

# FEAT: Global Dialog System Consistency Across Public, Student, and Admin

## Description

Standardize all dialog/modal UI across the application so every dialog follows a consistent structure, spacing system, button hierarchy, sizing behavior, and close interaction model.

## Context

The codebase currently mixes `AdminDialog`-based modals and custom modal implementations (for example public media/map dialogs), resulting in inconsistent visuals and interactions.

## Requirements

### Functional Requirements
- Define a shared dialog UI standard covering:
  - header/title/description structure
  - body spacing and section rhythm
  - footer/action alignment
  - button hierarchy and destructive-action placement
  - backdrop and close affordances (`X`, outside click policy, Escape behavior)
- Apply the standard to all dialog surfaces in scope:
  - admin dialogs (`bookings`, `customers`, `invoices`, and related child dialogs)
  - public dialogs/modals (`ImageModal`, `VideosGridModal`)
  - any student-facing dialog/modal surfaces currently in use.
- Ensure consistent responsive sizing rules (small/standard/wide) and scroll behavior.
- Ensure consistent empty/loading/error states inside dialog bodies.

### Non-Functional Requirements
- Preserve current functional behavior and data flow of each dialog.
- Maintain accessibility: focus trapping, keyboard navigation, ARIA semantics.
- Avoid regressions in existing scroll-lock and layered-modal behavior.

## Current State

Dialog implementation is partially centralized in `AdminDialog`, but non-admin modals and some admin flows still use local style/layout decisions that diverge visually and behaviorally.

## Desired State

All dialogs feel like one coherent system regardless of route, with predictable behavior and consistent visual language.

## Research Context

### Keywords to Search
- `AdminDialog` usage map - identify all modal consumers.
- `ImageModal` and `VideosGridModal` - align non-admin dialog patterns.
- dialog close behavior (`onClose`, escape, backdrop click) - unify interaction rules.
- dialog size classes/tokens - standardize width/height/overflow behavior.

### Patterns to Investigate
- `src/components/admin/ui/admin-dialog.tsx`
- `src/components/image-modal.tsx`
- `src/components/videos-grid-modal.tsx`
- `src/components/admin/bookings/booking-detail-dialog.tsx`
- `src/components/admin/customers/customer-dialog-wrapper.tsx`
- `src/components/admin/invoices/invoices-client.tsx`
- `src/styles/globals.css`

### Key Decisions Made
- Consistency is enforced as a design-system concern, not page-by-page ad-hoc styling.
- Functional bug fixes remain in their own tickets, while this ticket enforces cross-surface interaction parity.
- Non-admin modals are included explicitly so consistency is truly app-wide.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

### Manual Verification
- [ ] All key dialogs share consistent spacing, header/footer structure, and action button hierarchy.
- [ ] Close behavior is consistent (keyboard/backdrop/close button) across dialog types.
- [ ] Dialog sizing and scroll behavior are predictable and uniform on desktop/mobile.
- [ ] No modal appears visually isolated from the shared dialog system.

## Related Information

- Parent epic: `thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md`
- Related bug: `thoughts/tickets/bug_admin_dialog_consistency_invoice_customer_navigation_and_layout.md`

## Notes

- If refactoring to a single shared primitive is too large for one implementation pass, deliver in phased adapter migration with parity checks.
