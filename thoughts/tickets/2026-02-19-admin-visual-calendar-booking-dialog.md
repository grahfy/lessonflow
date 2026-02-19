# Admin Visual Calendar and Booking Dialog Enhancements

## Status
`researched`

## Request Summary
Upgrade the owner booking system UI from list-oriented management to a visual calendar workflow:
- Show confirmed bookings and pending bookings in a calendar view.
- Color-code statuses:
  - Confirmed: green.
  - Pending: yellow.
- Open a popup dialog when an event is clicked and show full booking/request details.
- Support in-dialog actions:
  - Cancel booking.
  - Edit booking/request details.
  - Move booking/request time.
  - Manually send reminder/notification to customer.
  - Send a custom email message to customer.

## Scope
- Replace the current list-first admin interaction model with a calendar-first interaction model.
- Keep existing admin authentication and existing booking approval workflows.
- Reuse existing SMTP + `OutboundEmail` infrastructure for manual reminder/custom emails.
- Preserve current timezone behavior (`Australia/Melbourne`) and existing current-year booking constraints.
- Show pending requests only when `requestedStartAt` falls inside the active day/week/month range.
- Treat popup cancel on pending requests as `rejected`.
- Automatically send customer update email when a confirmed booking is moved.
- Show cancelled and rejected items in calendar/history views for up to 48 hours.

## Non-Goals
- Rebuilding the public booking form flow.
- SMS/WhatsApp notifications.
- Multi-teacher calendars or payment workflows.

## Resolution Linkage
- Functional admin calendar/dialog requirements in this ticket are implemented in live code.
- Motion-depth and transition-risk concerns from this ticket are resolved through the global tween rollout spec:
  - `thoughts/tickets/2026-02-19-global-sequenced-ui-tween-animations.md`
  - `thoughts/plans/global-sequenced-ui-tween-animations-implementation-plan.md`
