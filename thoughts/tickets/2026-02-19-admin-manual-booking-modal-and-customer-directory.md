# Admin Manual Booking Modal and Customer Directory

## Status
`planned`

## Request Summary
Refine the admin booking workflow so manual booking is opened from a button (not always rendered), and add a reusable customer database for faster repeat booking entry.

Requested UX changes:
- Keep the calendar legend (`Confirmed`, `Pending`, `Rejected`, `Cancelled`).
- Under that legend area, add:
  - `Add Manual Booking` button (opens popup).
  - `Customers` button (opens popup).
- `Customers` popup should list customer name, contact number, email, and skill level.
- In the customer popup, support create, edit, and delete actions (all popup-driven).
- In `Add Manual Booking`, allow selecting an existing customer so fields auto-fill.
- If admin manually enters details in booking form, detect likely existing customer and confirm before save, then auto-fill/attach.

## Scope
- Admin page UX changes in `/admin/bookings`.
- Customer persistence model and CRUD API.
- Manual booking flow update to support customer linking and duplicate detection.
- Backward compatibility with existing booking/request records and current calendar behavior.

## Non-Goals
- Public booking form redesign.
- Payment, invoicing, or SMS workflows.
- Multi-teacher scheduling changes.

## Constraints
- Preserve existing admin auth/session model.
- Preserve existing booking validation guarantees (AU contact/address formats, current-year scheduling rules).
- Keep responsive admin layout and dialog animation quality.
