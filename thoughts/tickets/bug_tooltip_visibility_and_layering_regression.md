---
type: bug
priority: high
created: 2026-03-04
status: implemented
tags: [ui, ux, bug, tooltip, admin, student, public]
keywords: [tooltips do not appear, tooltip visibility bug, radix tooltip layering, tooltip z-index issue]
patterns: [src/components/admin/ui/tooltip.tsx, src/styles/globals.css, src/components/admin/**, src/components/student-*.tsx, src/components/booking-form.tsx]
---

# BUG: Tooltip Visibility and Layering Regression

## Description

Tooltips are not appearing where tooltip affordances are expected. Restore reliable tooltip visibility across admin, student, and public interfaces.

## Context

The shared tooltip wrapper (`@radix-ui/react-tooltip`) is widely used throughout the app. If tooltip content fails to render or appears behind overlays, user guidance is lost across major workflows.

## Requirements

### Functional Requirements
- Ensure tooltips render consistently on hover/focus/touch-compatible interactions where applicable.
- Ensure tooltip layer visibility above surrounding UI and dialogs (z-index/portal stacking).
- Verify tooltips appear in key surfaces:
  - admin bookings/customers/invoices
  - student login/portal/materials
  - public booking form and other tooltip-enabled controls.
- Preserve existing tooltip content strings and placement defaults unless readability requires adjustment.

### Non-Functional Requirements
- Maintain keyboard accessibility and focus-trigger behavior.
- Avoid introducing tooltip flicker or accidental occlusion in scrolling containers.

## Current State

Tooltip component exists and is used broadly, but user reports indicate tooltip content is not visible in practice.

## Desired State

All tooltip triggers show readable tooltip content reliably, including inside dialogs and dense admin layouts.

## Research Context

### Keywords to Search
- `ui-tooltip-content` and `ui-tooltip-arrow` styles - verify visibility/opacity/z-index.
- `TooltipPrimitive.Portal` behavior - ensure portal target/layering works across shells.
- `overflow hidden` ancestors - check clipping around table/dialog containers.
- pointer/focus trigger behavior across buttons and links.

### Patterns to Investigate
- `src/components/admin/ui/tooltip.tsx`
- `src/styles/globals.css` (`.ui-tooltip-content`, `.ui-tooltip-arrow`)
- `src/components/admin/bookings/bookings-client.tsx`
- `src/components/admin/invoices/invoices-client.tsx`
- `src/components/student-login-form.tsx`
- `src/components/student-portal-client.tsx`
- `src/components/booking-form.tsx`

### Key Decisions Made
- Treat this as a cross-surface bug, not page-specific polish.
- Validate tooltip behavior inside dialogs and scroll containers first, where layering bugs are most likely.
- Preserve current tooltip API contract so call sites do not need broad rewrites.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`

### Manual Verification
- [ ] Tooltip content appears on hover/focus in admin bookings controls.
- [ ] Tooltip content appears in invoices and customers controls.
- [ ] Tooltip content appears in student login/portal/materials controls.
- [ ] Tooltip content appears in public booking form controls.
- [ ] Tooltips are not clipped/hidden behind dialogs, cards, or sticky containers.

## Related Information

- Parent epic: `thoughts/tickets/feature_epic_overpass_public_student_admin_ui_ux_refresh.md`
- Related: `thoughts/tickets/feature_global_dialog_system_consistency_across_public_student_admin.md`

## Notes

- Include regression screenshots/video captures if layering behavior differs by route.
