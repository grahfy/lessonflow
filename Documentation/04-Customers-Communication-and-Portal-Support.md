# Customers, Communication, and Portal Support

The customer workflow is the identity and support layer of LessonFlow. It links student records to lesson history, billing context, communication history, and portal access, making it the primary reference area when an administrator needs to correct profile data or assist a student outside the booking calendar itself.

<div class="manual-callout info">
<strong>Scope note:</strong> The Customers area is used for confirmed identity and support tasks. It is not only a directory, but also the junction between customer records, communication, portal credentials, and billing history.
</div>

## Directory Functions

The customer directory supports the following activities:

- search and sort of customer records
- manual customer creation
- profile editing
- address maintenance
- portal credential support
- billing-history access
- archive or delete actions where permitted

These functions make the directory the preferred starting point for support questions tied to a known student or family.

## Record Creation and Duplicate Avoidance

Before a new customer record is created, the directory should be searched by:

- full name
- email address
- phone number

Duplicate records complicate portal access, invoice history, and lesson continuity. Preventing duplication is therefore preferable to repairing it later through manual reconciliation.

## Profile Maintenance

The customer profile may include:

- contact details
- skill level
- lesson mode
- primary teacher assignment
- address information
- portal credential status

Profile changes should be based on confirmed information, particularly where the record is already attached to active bookings or invoices.

## Assigned Teacher Context

The customer workflow now exposes the assigned or primary teacher as an editable dropdown rather than as passive text. This field should be treated as the default staff ownership for later bookings, support context, and follow-up.

On a single-user install, the owner may appear as the only assignable teacher. This is expected behaviour when no separate active teacher account exists.

## Portal Credential Support

LessonFlow exposes student-portal credential support from the customer workflow so administrators can resolve access issues without leaving the record.

| Action | Purpose | Operational effect |
| --- | --- | --- |
| Reveal Password | Show the current credential | Used when the existing credential is still valid |
| Regenerate | Create a replacement credential | Immediately supersedes the prior credential |
| Credential status view | Confirm whether a credential exists | Supports diagnosis before intervention |

<div class="manual-callout warning">
<strong>Immediate effect:</strong> Portal credential changes affect the student as soon as they are saved. Password regeneration should therefore be treated as a deliberate support action rather than a diagnostic shortcut.
</div>

## Billing History

The billing-history action provides a direct route from the customer profile to invoice context. It is the preferred path when a student or parent asks about recent invoices, outstanding balances, or prior billing activity.

## Communication Tools

The communication panel is designed to support both historical review and direct outbound contact.

It may be used to determine:

- whether a reminder or invoice email was already sent
- which subject line or delivery route was used
- whether the item originated in the app or through Gmail sync
- whether an error was recorded

Manual email composition remains available for messages that do not fit the automated workflow.

### Manual Email Practice

Before sending a manual email, administrators should confirm:

1. the correct customer record is open
2. the recipient address is accurate
3. the message contains a clear subject and next step
4. the CAPTCHA check has been completed

## Archive and Deletion

Deletion is not necessarily equivalent to immediate hard removal. Records with linked history may instead be archived in order to preserve operational context.

Archive or delete actions should therefore be reserved for cases in which the record should no longer appear in ordinary active work and the historical impact is understood.

## Related Sections

- [Daily Operations and Booking Lifecycle](03-Daily-Operations-and-Booking-Lifecycle.md)
- [Staff Management and Teacher Assignment](03a-Staff-Management-and-Teacher-Assignment.md)
- [Invoicing and Payments](05-Invoicing-and-Payments.md)
- [Learning Materials and Notifications](06-Learning-Materials-and-Notifications.md)
- [Public Intake and Student Portal](10-Public-Intake-and-Student-Portal.md)
