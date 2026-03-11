# Start Here and Features

LessonFlow is a lesson-management platform that combines public intake, administrative scheduling, customer records, billing, reporting, and student self-service within a single operating environment. This chapter serves as the general orientation article for the manual and outlines the major system areas, the recommended reading sequence, and the operational principles that govern safe use.

<div class="manual-callout info">
<strong>Reference note:</strong> The in-app manual at <code>/admin/manual</code> renders this documentation for live use inside the admin console. The Markdown files in <code>Documentation/</code> remain the authored source of truth.
</div>

## Overview

LessonFlow is organised around connected workflows rather than isolated screens. A booking request may lead to customer creation, lesson confirmation, portal access, reminder traffic, invoice issuance, and later payment follow-up. The manual is therefore arranged by operational domain, but each chapter also identifies where one workflow passes into another.

## Major System Areas

| Area | Primary function | Typical outcomes |
| --- | --- | --- |
| Bookings | Calendar-based lesson administration | Request review, confirmation, rescheduling, cancellation, reminder actions |
| Customers | Identity and support records | Profile updates, portal support, billing lookup, communication history |
| Invoices | Billing lifecycle management | Drafting, sending, reminding, payment-state updates, credit-note handling |
| Reports | Operational and financial summaries | Follow-up decisions, overdue review, activity trend review |
| Learning Materials | Student-facing resource distribution | Lesson-linked uploads, general practice materials, file removal |
| Public Intake | Website enquiry capture | Booking requests and contact submissions for later admin review |
| Student Portal | Student self-service | Portal login, lesson requests, cancellations, materials access |
| Settings | Business and system configuration | Branding, content, templates, invoice defaults, technical configuration |
| Logs and Issue Reporting | Evidence gathering and escalation | Event review, filtering, bug reports, screenshot-supported escalation |
| Technical Owner Tooling | Deployment and host maintenance | Installation, updates, timers, services, recovery tasks |

## Recommended Reading Sequence

The following sequence is recommended for new administrators and owners:

1. [First-Time Setup and Admin Access](02-First-Time-Setup-and-Admin-Access.md)
2. [Daily Operations and Booking Lifecycle](03-Daily-Operations-and-Booking-Lifecycle.md)
3. [Customers, Communication, and Portal Support](04-Customers-Communication-and-Portal-Support.md)
4. [Invoicing and Payments](05-Invoicing-and-Payments.md)
5. [Reports and Follow-Up](07-Reports-and-Follow-Up.md)
6. [Settings and Configuration](08-Settings-and-Configuration.md)
7. [Logs and Bug Reporting](09-Logs-and-Bug-Reporting.md)

This reading order begins with access and day-to-day workflows, then moves into support, billing, configuration, and diagnostics.

## Operational Principles

The manual assumes the following principles throughout:

1. Records should be confirmed before they are altered.
2. Editing and archiving are generally safer than deletion when history matters.
3. Communication activity is part of normal administration rather than a separate optional task.
4. High-impact actions should be verified immediately after they are saved or triggered.
5. Unexplained behaviour should be escalated through logs or technical-owner workflows rather than addressed by guesswork.

## High-Risk Actions

<div class="manual-callout warning">
<strong>High-risk actions include:</strong> customer deletion, invoice deletion, credential rotation, system-setting edits, and production deployment commands.
</div>

These actions remain part of the documented product surface, but they should be approached as controlled interventions rather than routine clicks. When the effect of a destructive action is unclear, the related chapter should be reviewed before the action is taken.

## Manual Structure

The in-app manual groups content into orientation, operations, support, configuration, diagnostics, system awareness, and technical ownership. This structure is intended to help readers move from general product understanding to specific workflows without losing the relationship between screens.

## Related Sections

- [First-Time Setup and Admin Access](02-First-Time-Setup-and-Admin-Access.md)
- [Daily Operations and Booking Lifecycle](03-Daily-Operations-and-Booking-Lifecycle.md)
- [How LessonFlow Works](12-How-LessonFlow-Works.md)
