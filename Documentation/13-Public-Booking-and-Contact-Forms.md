# 13 Public Booking and Contact Forms

## What This Covers
These are the two public forms on the website:
- `/book` for booking requests
- `/contact` for general enquiries

This guide explains what the visitor sees and what the admin should do next.

## Public Booking Requests (`/book`)

### What the Visitor Sees
1. They fill in the booking request form.
2. They click `Request Booking`.
3. They should see a confirmation pop-up that says the request is pending.

If they report it “stuck on Submitting…”:
- tell them to refresh and try again
- then check the admin bookings console to see if it saved anyway

### What the Admin Does Next
1. Open `/admin/bookings`.
2. Turn on `Pending` filter.
3. Click the request.
4. Choose one:
   - `Approve request` to create a confirmed booking
   - `Reject request` to decline
   - `Cancel` if it should not proceed
   - `Remove request entirely` to delete it permanently
5. Optional: message the customer using notify/email actions.

## Public Contact Form (`/contact`)

### What the Visitor Sees
1. They submit the form.
2. The app shows a confirmation message.

### What the Admin Does Next
- The owner/admin receives the message email (if email delivery is configured), or it may be queued if not.
- If needed, respond manually.

## If Email Delivery Is Not Working
Sometimes the website can still save a submission even if email sending fails.

This means:
- the booking request/contact message may exist in the system
- but email notifications might not arrive

When in doubt:
1. Check `/admin/bookings` for pending requests.
2. If necessary, contact the customer manually.

## Visual Reference
![Public booking page](assets/public-book-page.png)
![Public contact page](assets/public-contact-page.png)

## Common Beginner Mistakes
- Assuming the request failed just because an email did not arrive
  - Fix: check `/admin/bookings` for the saved request

## Troubleshooting
- Booking request stuck on `Submitting...`:
  - refresh and retry
  - check admin bookings for a saved request
- Visitor did not receive an email:
  - confirm email delivery configuration
  - respond manually if required

## Next Guides
- [03-Booking-Management.md](03-Booking-Management.md)
- [06-Email-and-Notifications.md](06-Email-and-Notifications.md)
- [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md)
