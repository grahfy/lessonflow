# 03 Booking Management

## Overview
Use the booking console to review lesson requests, manage confirmed bookings, and keep schedules accurate.

## Before You Start
- Sign in at `/admin/login`.
- Open `/admin/bookings`.
- Understand status colors in the legend:
  - `Confirmed`
  - `Pending`
  - `Rejected (48h)`
  - `Cancelled (48h)`

## Step-by-Step Instructions

### A) Review Calendar and Pick a View
1. Use the view selector to switch `Day`, `Week`, or `Month`.
2. Set `Base date` if you need a specific day or week.
3. Click a booking or request to open the detail dialog.

### B) Approve or Reject Pending Requests
1. Click a pending request.
2. Review customer details and requested lesson details.
3. Click:
   - `Approve request` to convert to confirmed booking, or
   - `Reject request` to decline.

### C) Edit, Move, or Cancel Confirmed Bookings
1. Click a confirmed booking.
2. Update details as needed (contact details, lesson details, time).
3. Click `Save details` for profile/booking edits.
4. Click `Move booking` if start time/date changed.
5. Click `Cancel booking` if lesson is cancelled.

### D) Send Booking Communications
1. Open a booking.
2. Use:
   - `Send reminder` for reminder message.
   - `Email customer` for a custom message.

### E) Remove Future Recurring Series
1. Open a booking that belongs to a recurring series.
2. Click `Remove series`.
3. Confirm the action.

### F) Create Invoice from Booking
1. Open a confirmed booking.
2. Click `Create invoice`.
3. Enter:
   - lesson fee,
   - due date,
   - optional extras (books/digital/custom),
   - tax mode,
   - notes.
4. Click `Create invoice`.
5. Continue invoice processing in `/admin/invoices`.

## Visual Reference
![Booking calendar week view](assets/booking-calendar-week-view.png)
![Manual booking dialog customer step](assets/manual-booking-dialog-customer-step.png)
![Booking detail dialog with notes and actions](assets/booking-detail-dialog-notes-and-actions.png)
![Booking create invoice dialog](assets/booking-create-invoice-dialog.png)

## Expected Result
- Bookings reflect real schedule status.
- Customers receive timely communications.
- Billing can start directly from completed lesson operations.

## Common Mistakes
- Editing booking fields but forgetting `Save details`.
- Moving a booking but skipping reminder communication.
- Cancelling single booking when you meant to remove the full recurring series.

## Troubleshooting
- Booking not visible:
  - Check date range/view.
  - Confirm status filter context in legend.
- Cannot process pending request:
  - Re-open request and verify required fields are valid.
- Invoice button not visible:
  - Confirm the item is a confirmed booking, not pending request.

## Related Guides
- [04-Customer-Directory.md](04-Customer-Directory.md)
- [05-Invoice-Management.md](05-Invoice-Management.md)
- [06-Email-and-Notifications.md](06-Email-and-Notifications.md)
