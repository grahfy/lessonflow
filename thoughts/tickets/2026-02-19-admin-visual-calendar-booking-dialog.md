# Admin Visual Calendar and Booking Dialog Enhancements

## Status
`planned`

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

## Non-Goals
- Rebuilding the public booking form flow.
- SMS/WhatsApp notifications.
- Multi-teacher calendars or payment workflows.
