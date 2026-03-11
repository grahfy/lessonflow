# Daily Operations and Booking Lifecycle

<div class="manual-callout success">
<strong>Main operational hub:</strong> The booking calendar is where most admin work starts. Use it first each day before you move into billing or settings.
</div>

This chapter combines the daily admin rhythm with the lesson lifecycle, because the two are tightly connected in LessonFlow.

## Daily rhythm

Use this order for routine administration:

1. open `Bookings`
2. review pending requests and upcoming lessons
3. resolve moves, cancellations, and manual booking needs
4. jump into customer or invoice workflows where needed
5. finish with reports, logs, or follow-up communication

## Booking views

The bookings screen supports:

- `Day`
- `Week`
- `Month`
- `Year`
- previous and next range navigation

Use `Week` for most day-to-day work. Use `Month` or `Year` when planning ahead.

## Pending request vs confirmed booking

Pending requests and confirmed bookings appear in the same calendar, but they do not behave the same way.

| Record type | What it means | Common next action |
| --- | --- | --- |
| Pending request | The customer asked for a lesson but it is not confirmed yet | Review, approve, remind, or send a custom message |
| Confirmed booking | A scheduled lesson already exists | Edit, move, cancel, notify, assign materials, or invoice |
| Cancelled record | Historical evidence of a cancelled lesson or request | Review context only; do not treat it as active work |

## Approving a booking request

Open the request from the calendar and review:

- contact details
- lesson mode
- requested time
- notes
- matched customer suggestions

Use `Approve Request` when you are ready to convert it into a confirmed booking.

<div class="manual-callout info">
<strong>Important:</strong> First approval can also create or attach customer data and ensure a portal credential exists for the student.
</div>

## Creating a manual booking

Use `New Booking` when the lesson did not start from the public booking form.

The manual booking dialog walks through:

1. choosing or creating the customer
2. resolving a duplicate-customer match if one is detected
3. entering lesson timing and details
4. saving the booking

If LessonFlow detects a likely existing customer, choose the correct path:

- use the existing customer
- update the existing customer from the booking details
- create a new customer anyway

Do not ignore a likely match unless you are sure the records are different people.

## Editing an existing booking

Confirmed bookings can be opened and adjusted to update:

- student details
- lesson details
- notes
- address information
- linked customer context

Always save after checking the correct booking is open.

## Moving a lesson

Use `Move Lesson Time` from the booking dialog when the lesson still exists but the time has changed.

### Before you move it

- confirm the new time with the student
- check it is the correct lesson
- verify you are not editing the wrong week or day

## Cancelling a lesson

Use `Cancel Booking` only when the lesson should no longer happen.

Cancelled records remain valuable history. Do not expect them to disappear immediately.

## Booking-side actions that lead to other screens

- `Open Customer` -> takes you into the customer profile workflow
- `Invoice / Billing` -> opens or creates invoice work in the invoices area
- notification actions -> send booking reminders or custom emails
- materials actions -> manage lesson-linked learning materials

## End-of-day booking checklist

1. No urgent pending requests left unseen.
2. Time changes and cancellations have been recorded correctly.
3. Any lesson that should become billable has an invoice path.
4. Students received any required reminder or custom follow-up.

## When to escalate

Move to another chapter when the booking work crosses into another domain:

- customer record problem -> [Customers, Communication, and Portal Support](04-Customers-Communication-and-Portal-Support.md)
- billing issue -> [Invoicing and Payments](05-Invoicing-and-Payments.md)
- materials issue -> [Learning Materials and Notifications](06-Learning-Materials-and-Notifications.md)
- unexplained failure -> [Logs and Bug Reporting](09-Logs-and-Bug-Reporting.md)
