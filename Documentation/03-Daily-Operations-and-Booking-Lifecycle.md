# Daily Operations and Booking Lifecycle

The booking calendar is the principal operational surface of LessonFlow. It combines pending requests, confirmed lessons, and lesson-history actions within one workflow, making it the usual starting point for daily administration. This chapter describes the routine operating pattern, the lifecycle states visible in the calendar, and the actions that can be taken from each state.

<div class="manual-callout success">
<strong>Operational note:</strong> For most schools, the Bookings area functions as the daily control room. Billing, customer support, notifications, and materials frequently begin here even when they conclude on another screen.
</div>

## Daily Operating Pattern

A routine day in LessonFlow commonly follows this sequence:

1. review pending requests and upcoming lessons
2. resolve schedule changes, cancellations, and manual bookings
3. hand off customer, invoice, or communication issues to the relevant workflow
4. confirm that urgent follow-up has been recorded

This pattern is recommended because the booking calendar exposes the most time-sensitive work first.

## Calendar Views

The bookings interface provides the following views:

- <code>Day</code>
- <code>Week</code>
- <code>Month</code>
- <code>Year</code>

The week view is generally the most practical for day-to-day administration, while month and year views are more useful for forward planning and broader schedule review.

## Booking States

Pending requests and confirmed bookings share the same calendar surface but represent different stages in the lifecycle.

| Record type | Meaning | Common next actions |
| --- | --- | --- |
| Pending request | A lesson has been requested but not confirmed | Review, approve, remind, or send a custom message |
| Confirmed booking | A scheduled lesson exists in the live calendar | Edit, move, cancel, notify, assign materials, or invoice |
| Cancelled record | Historical evidence of a cancelled request or lesson | Review context only; no longer active work |

## Request Approval

Approving a booking request converts intake activity into a live booking workflow. Before approval, the request should be checked for:

- customer identity and contact details
- requested lesson mode
- requested time
- notes or special circumstances
- possible customer matches suggested by the system

<div class="manual-callout info">
<strong>System behaviour:</strong> Request approval may also attach the booking to an existing customer record, create a new customer, and ensure that a student portal credential exists.
</div>

## Manual Booking Creation

Manual bookings are used when the lesson did not originate from the public booking form or when administration is acting on information gathered outside the standard intake route.

The dialog proceeds through four broad stages:

1. customer selection or creation
2. duplicate-match review where applicable
3. lesson detail entry
4. schedule confirmation and save

Where a likely duplicate customer is detected, the operator should deliberately choose between using the existing record, updating that record, or creating a distinct new one. Duplicate creation should be treated as an exceptional choice rather than the default.

## Booking Editing and Movement

Confirmed bookings can be edited to update lesson details, student information, notes, and address data. Rescheduling is performed through the lesson-move flow and should only be done after the intended replacement time is confirmed.

Before moving a lesson, confirm:

- the correct lesson is open
- the correct week or day is being edited
- the replacement time has been agreed

## Cancellation

Cancellation removes the lesson from active scheduling but preserves the historical record. The presence of a cancelled record should therefore be interpreted as retained context rather than a failed deletion.

## Cross-Workflow Actions

Booking records serve as gateways into other administrative domains:

| Booking-side action | Destination workflow |
| --- | --- |
| Open Customer | [Customers, Communication, and Portal Support](04-Customers-Communication-and-Portal-Support.md) |
| Invoice / Billing | [Invoicing and Payments](05-Invoicing-and-Payments.md) |
| Reminder or custom email actions | [Learning Materials and Notifications](06-Learning-Materials-and-Notifications.md) |
| Materials actions | [Learning Materials and Notifications](06-Learning-Materials-and-Notifications.md) |

## End-of-Day Review

At the end of a normal operating period, administrators should confirm:

1. urgent pending requests have been reviewed
2. schedule changes and cancellations are reflected correctly
3. lessons that need billing have an invoice path
4. required follow-up communication has been sent or recorded

## Related Sections

- [Customers, Communication, and Portal Support](04-Customers-Communication-and-Portal-Support.md)
- [Invoicing and Payments](05-Invoicing-and-Payments.md)
- [Learning Materials and Notifications](06-Learning-Materials-and-Notifications.md)
- [Logs and Bug Reporting](09-Logs-and-Bug-Reporting.md)
