---
type: bug
priority: high
created: 2026-03-04
status: implemented
tags: [admin, bookings, dialog, modal, scrolling, ux]
keywords: [edit booking dialog scroll lock, appointment modal background scroll, prevent up and down scrolling behind dialog]
patterns: [src/components/admin/bookings/booking-detail-dialog.tsx, src/components/admin/ui/admin-dialog.tsx, src/styles/globals.css]
---

# BUG: Edit Booking Dialog Must Lock Background Scrolling and Stabilize Internal Scroll Areas

## Description

When the appointment edit dialog is open from bookings, the page should not scroll up/down behind the modal. Internal dialog sections should handle overflow predictably.

## Context

The request explicitly asks to prevent scrolling while appointment edit is open. Current modal implementation uses an internal scroll container but does not guarantee body/background scroll lock on all viewports.

## Requirements

### Functional Requirements
- Lock page/body scroll whenever `Edit Booking` dialog is open.
- Keep dialog header/footer visible while long form content scrolls inside the modal.
- Ensure `Appointment` and `Communication` tabs both respect the same scroll boundaries.
- Prevent nested scroll jitter between modal shell and inner pane.

### Non-Functional Requirements
- Preserve escape-key and backdrop close behavior.
- No regressions in mobile and desktop dialog usability.
- Keep modal focus behavior accessible.

## Current State

`AdminDialog` renders with internal `overflowY: auto`, and booking dialog adds additional wrappers (`booking-dialog-scroll`, `dialog-layout`), but scroll lock behavior is not fully enforced at document level.

## Desired State

Opening `Edit Booking` freezes background page scrolling; only the intended dialog content area scrolls.

## Research Context

### Keywords to Search
- `dialog-backdrop` - inspect modal root behavior.
- `booking-dialog-scroll` - identify nested overflow containers.
- `overflow` + `admin-layout-content` - check competing page-level scrolling styles.

### Patterns to Investigate
- `src/components/admin/bookings/booking-detail-dialog.tsx`
- `src/components/admin/ui/admin-dialog.tsx`
- `src/styles/globals.css`

### Key Decisions Made
- Fix should be applied through shared modal behavior (`AdminDialog`) with booking-specific layout checks.
- Scope excludes unrelated list/table scroll issues outside modal-open state.

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Add/update modal behavior tests for body scroll lock (where feasible).

### Manual Verification
- [ ] Open `/admin/bookings`, launch `Edit Booking` from a calendar event.
- [ ] Attempt mouse wheel/trackpad scroll on background page; confirm no movement.
- [ ] Verify long booking form content still scrolls inside dialog.
- [ ] Verify dialog close restores background scrolling.

## Related Information

- `src/components/admin/bookings/booking-detail-dialog.tsx`
- `src/components/admin/ui/admin-dialog.tsx`
- `src/styles/globals.css`

## Notes

- Consider consolidating modal scroll-lock logic so all admin dialogs inherit consistent behavior.
