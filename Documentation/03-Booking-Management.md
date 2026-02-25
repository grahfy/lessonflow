# 03 Booking Management

## What This Screen Does
The Bookings screen (`/admin/bookings`) is your calendar and request inbox.

You use it to:
- approve or reject new lesson requests
- view confirmed bookings on the calendar
- move or cancel bookings
- message customers
- create invoices from a booking

## Before You Start
1. Sign in at `/admin/login`.
2. Open `/admin/bookings`.

You will see a legend/status filter row at the top:
- `Confirmed` (confirmed lessons)
- `Pending` (requests waiting for a decision)
- `Rejected (48h)` (kept for a short time)
- `Cancelled (48h)` (kept for a short time)

Tip:
- If something “disappears”, check the filters and the date you are viewing.

## The Basic Pattern (How This Screen Works)
1. Pick a view: `Day`, `Week`, or `Month`.
2. Pick a date (`Base date`).
3. Click an item on the calendar to open its detail dialog.
4. Do one action, then check the notice message at the top.

## Common Tasks (Step-by-Step)

### A) Approve a Pending Request
1. Turn on the `Pending` filter (if it is not already on).
2. Click the pending request in the calendar list.
3. Check the customer details and requested time.
4. Click `Approve request`.
5. The request becomes a confirmed booking (green/confirmed).

### B) Reject a Pending Request
1. Click the pending request.
2. Click `Reject request`.
3. If you need to explain why, use `Email customer` (optional).

### C) Add a Manual Booking (Admin-Created)
Use this when you are creating a booking directly (phone call, in-person, etc.).
1. Click `Add Manual Booking`.
2. Choose an existing customer or create a new customer.
3. Pick the lesson time and details.
4. Save the booking.

### D) Edit Booking Details (Without Moving Time)
Use this for notes, contact edits, lesson details, etc.
1. Click a confirmed booking.
2. Make changes in the form fields.
3. Click `Save details`.

### E) Move a Booking (Change the Date/Time)
Use this if the start time/date needs to change.
1. Click a confirmed booking.
2. Click `Move booking`.
3. Choose the new date/time in the pop-up picker.
4. Confirm the move.

### F) Cancel a Booking
1. Click a confirmed booking.
2. Click `Cancel booking`.
3. Confirm.

### G) Send a Reminder or Message to a Customer
1. Click a confirmed booking.
2. Click:
   - `Send reminder` (standard reminder)
   - `Email customer` (custom message)

### H) Create an Invoice From a Booking
1. Click a confirmed booking.
2. Click `Create invoice`.
3. Fill in lesson fee and due date.
4. Add optional extras if needed.
5. Click `Create invoice`.
6. Continue in `/admin/invoices` if you need to edit/send later.

## Visual Reference
![Booking calendar week view](assets/booking-calendar-week-view.png)
![Manual booking dialog customer step](assets/manual-booking-dialog-customer-step.png)
![Booking detail dialog with notes and actions](assets/booking-detail-dialog-notes-and-actions.png)
![Booking create invoice dialog](assets/booking-create-invoice-dialog.png)

## What “Good” Looks Like
- Pending requests are processed quickly (approve/reject).
- The calendar matches the real lesson schedule.
- Changes are recorded with the right action:
  - `Save details` for edits
  - `Move booking` for time changes
  - `Cancel booking` for cancellations

## Common Beginner Mistakes
- You change the start time but only click `Save details`
  - Fix: use `Move booking` to change time/date
- You cannot find a booking
  - Fix: confirm filters and date range
- You create a manual booking with a duplicate customer
  - Fix: search first in `Customers`

## Troubleshooting
- “Nothing happens” after clicking an action:
  - wait 2–3 seconds, then check for a notice at the top
  - refresh the page and try again
  - if it keeps happening, see `08-Troubleshooting-and-FAQs.md`
- Invoice button missing:
  - you may be clicking a pending request, not a confirmed booking

## Next Guides
- [04-Customer-Directory.md](04-Customer-Directory.md)
- [05-Invoice-Management.md](05-Invoice-Management.md)
- [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md)
