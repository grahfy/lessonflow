# LessonFlow Admin Operations Manual

<div class="manual-callout info">
<strong>Manual Purpose:</strong> This manual explains how to run LessonFlow day to day, from first login through bookings, customer care, invoicing, reporting, and operational troubleshooting.
</div>

This documentation is written as an end-user operations handbook for real administrative work, not as developer reference notes. Each section is designed to be read in full so that an operator understands both what to click and why the step matters. The language assumes you are responsible for reliable outcomes such as confirmed lessons, accurate customer records, and invoices that move cleanly from draft to payment completion.

The handbook is specifically tailored for music teachers, private studio operators, and music school administration teams who manage timetables, student progress touchpoints, and parent or student billing cycles.

If you are new to LessonFlow, begin with the opening sequence and read the first five sections in order. That flow builds the mental model needed to operate the platform confidently: access control, booking workflow, customer profile management, and billing execution. Once those foundations are in place, the remaining chapters support advanced daily routines, issue recovery, and technical owner responsibilities.

The in-app manual at `/admin/manual` renders the same content and should be treated as the operational source of truth during live work. Repository markdown files remain the authored base, while the in-app experience adds structured navigation and screenshot context.

## Recommended Reading Sequence

For first-day onboarding, read the following sequence from start to finish: [01-Getting-Started.md](01-Getting-Started.md), [02-Admin-Login-and-Access.md](02-Admin-Login-and-Access.md), [03-Booking-Management.md](03-Booking-Management.md), [04-Customer-Directory.md](04-Customer-Directory.md), and [05-Invoice-Management.md](05-Invoice-Management.md).

For routine operations after onboarding, work primarily with [03-Booking-Management.md](03-Booking-Management.md), [05-Invoice-Management.md](05-Invoice-Management.md), [06-Email-and-Notifications.md](06-Email-and-Notifications.md), and [07-Reports-Outstanding-and-Follow-Up.md](07-Reports-Outstanding-and-Follow-Up.md).

For issue handling and support, use [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md) as your first reference, then follow the cross-links in that chapter to the workflow-specific sections.

## Complete Section Index

[01-Getting-Started.md](01-Getting-Started.md) establishes operational context, responsibility boundaries, and first-day orientation. [02-Admin-Login-and-Access.md](02-Admin-Login-and-Access.md) covers secure sign-in behavior and access recovery. [03-Booking-Management.md](03-Booking-Management.md) documents request approval, appointment edits, movement, cancellation, and booking-side actions. [04-Customer-Directory.md](04-Customer-Directory.md) explains profile quality standards, merge discipline, and portal support implications. [05-Invoice-Management.md](05-Invoice-Management.md) defines lifecycle transitions, sending, follow-up, and payment correction routines. [06-Email-and-Notifications.md](06-Email-and-Notifications.md) details delivery expectations and communication controls. [07-Reports-Outstanding-and-Follow-Up.md](07-Reports-Outstanding-and-Follow-Up.md) describes cadence-based financial follow-up. [08-Troubleshooting-and-FAQs.md](08-Troubleshooting-and-FAQs.md) provides structured triage. [09-Glossary.md](09-Glossary.md) keeps terminology consistent. [10-Admin-Settings-and-System-Configuration.md](10-Admin-Settings-and-System-Configuration.md) covers high-impact configuration management. [11-Admin-Reports-Dashboard.md](11-Admin-Reports-Dashboard.md) explains metric interpretation. [12-Student-Portal-and-Learning-Materials.md](12-Student-Portal-and-Learning-Materials.md) supports student-facing operational assistance. [13-Public-Booking-and-Contact-Forms.md](13-Public-Booking-and-Contact-Forms.md) explains intake workflow conversion. [digitalocean-admin-operations.md](digitalocean-admin-operations.md) is reserved for technical owners.

## Screenshot and Visual Reference Pipeline

Screenshot assets are authored into `Documentation/assets/` and mirrored into `public/documentation/screenshots/` for in-app manual rendering. The canonical refresh workflow remains `npm run docs:screenshots:seed`, then `npm run docs:screenshots`, then `npm run docs:screenshots:sync`. This sequence should run whenever UI labels, major layouts, or action positions change.

## Governance and Update Discipline

Manual quality depends on keeping procedure text synchronized with production behavior. When a workflow changes, the associated documentation section must be updated in the same release window. If a change affects what an operator sees on screen, screenshot refresh is required. If a change alters outcomes or prerequisites, the relevant chapter must include the new operational rationale, not just a label update. This governance rule prevents silent drift between software behavior and user instruction.
