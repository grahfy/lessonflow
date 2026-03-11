# Start Here and Features

<div class="manual-callout info">
<strong>Use this first:</strong> Read this chapter before touching live bookings, invoices, or settings. It gives you the operating model for LessonFlow and shows what the platform can do for you.
</div>

LessonFlow is designed to keep your public enquiries, student records, bookings, billing, communications, reports, and technical operations connected. The safest way to use the system is to think in workflows instead of isolated pages. A booking request can turn into a customer record, a confirmed lesson, a portal login, a lesson reminder, an invoice, and a payment follow-up.

## What LessonFlow lets you do

| Area | What you can do |
| --- | --- |
| Bookings | View lessons in day, week, month, and year views; approve requests; create manual bookings; move or cancel lessons; send reminders; create invoices from bookings |
| Customers | Search student records; edit contact details; view billing history; manage portal credentials; archive or delete safely |
| Invoices | Create draft or send-now invoices; use presets; resend or remind; mark paid/unpaid; void; create credit notes |
| Reports | Review daily, weekly, monthly, yearly, and custom-range summaries; email reports; track overdue billing |
| Learning Materials | Upload, preview, and delete files; link them to a booking or keep them available across lessons |
| Public Intake | Accept new lesson requests and contact enquiries from the website |
| Student Portal | Help students sign in, request lessons, cancel lessons, and access materials |
| Settings | Change branding, invoice, content, email, product, and system configuration |
| Logs and Bug Reports | Review system events, filter issues, and submit technical reports with log context |
| Technical Owner Tools | Install LessonFlow on a VPS, update it safely, review deployments, and manage services/timers |

## Recommended reading order

1. [First-Time Setup and Admin Access](02-First-Time-Setup-and-Admin-Access.md)
2. [Daily Operations and Booking Lifecycle](03-Daily-Operations-and-Booking-Lifecycle.md)
3. [Customers, Communication, and Portal Support](04-Customers-Communication-and-Portal-Support.md)
4. [Invoicing and Payments](05-Invoicing-and-Payments.md)
5. [Reports and Follow-Up](07-Reports-and-Follow-Up.md)
6. [Settings and Configuration](08-Settings-and-Configuration.md)
7. [Logs and Bug Reporting](09-Logs-and-Bug-Reporting.md)

## Operating principles

> Every action in LessonFlow has a downstream effect. If you move a lesson, a customer experience changes. If you mark an invoice paid incorrectly, your financial reporting becomes unreliable.

Use these principles throughout the manual:

1. Confirm the record before changing it.
2. Prefer editing and archiving over deleting when history matters.
3. Treat customer communication as part of the job, not an optional extra.
4. Check the result of high-risk actions immediately.
5. Escalate to logs or the technical owner when the system behaves unexpectedly.

## High-risk actions

<div class="manual-callout warning">
<strong>Take extra care with:</strong> deleting customers, deleting invoices, rotating credentials, editing system settings, and running deploy scripts on the VPS.
</div>

High-risk actions are still documented in this manual, but they should never be rushed. If a screen shows a destructive action and you are not sure of the effect, stop and read the related chapter before continuing.

## Screenshot-backed guidance

The in-app manual at `/admin/manual` renders the same documentation and adds screenshot viewing. Treat the markdown in `Documentation/` as the source of truth and the in-app manual as the most convenient way to read it during live work.
