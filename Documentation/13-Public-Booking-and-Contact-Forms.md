# 13 Public Booking and Contact Forms

## Overview
This guide explains what happens when website visitors use the public forms and how admins should handle those submissions.

Public routes covered:
- `/book` (booking request form)
- `/contact` (contact form)

## Before You Start
- Confirm public site pages are loading normally.
- Confirm admin login works (`/admin/login`) so you can review booking requests.

## Step-by-Step Instructions

### A) Public Booking Request Flow (`/book`)
1. Visitor opens `/book`.
2. Visitor enters booking details and requested date/time.
3. Visitor clicks `Request Booking`.
4. The site shows a confirmation popup stating the booking submission is pending and that the school will respond within 24 hours.

### B) What Admin Does Next (Booking Requests)
1. Open `/admin/bookings`.
2. Review pending requests in the calendar/status views.
3. Open the booking request dialog.
4. Choose the correct action:
   - `Approve` (creates confirmed booking),
   - `Reject`,
   - `Cancel`, or
   - `Remove request entirely` (permanent removal).
5. Use `Notify` actions if follow-up messaging is needed.

### C) Public Contact Form Flow (`/contact`)
1. Visitor opens `/contact`.
2. Visitor submits the contact form.
3. Admin/owner receives (or queues) the message email depending on email delivery configuration.

### D) If Email Delivery Is Degraded
Some public form flows can still save submissions even if email sending is temporarily unavailable.

Operationally:
- booking/contact submission may still be recorded,
- notification email may fail/queue,
- admin should review pending requests/messages and respond manually if needed.

## Visual Reference
![Public booking page](assets/public-book-page.png)
![Public contact page](assets/public-contact-page.png)

## Expected Result
- Public users receive clear feedback after submission.
- Admin can process requests from the booking console without losing the submission.

## Common Mistakes
- Treating a temporary email issue as a failed booking request when the request was actually saved.
- Forgetting to review pending booking requests after public demand spikes.

## Troubleshooting
- Booking form stays on `Submitting...`:
  - refresh and retry,
  - check network/API status,
  - verify server logs if issue persists.
- User reports no confirmation email:
  - check email delivery configuration,
  - verify request exists in admin bookings,
  - respond manually if needed.

## Related Guides
- [03-Booking-Management.md](03-Booking-Management.md)
- [06-Email-and-Notifications.md](06-Email-and-Notifications.md)
- [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md)
