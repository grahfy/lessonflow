# Troubleshooting and Quick Reference

<div class="manual-callout warning">
<strong>Use this chapter when something feels wrong:</strong> start with the symptom, not with guesswork. If the issue still does not make sense after the relevant checks, move to the logs page or escalate.
</div>

## Quick Symptom Map

| Symptom | First place to check |
| --- | --- |
| Setup redirects keep returning or the system says setup is incomplete | [02-First-Time-Setup-and-Admin-Access.md](02-First-Time-Setup-and-Admin-Access.md) |
| Booking request, lesson move, or calendar action does not behave as expected | [03-Daily-Operations-and-Booking-Lifecycle.md](03-Daily-Operations-and-Booking-Lifecycle.md) |
| Customer profile, portal password, or manual email support is unclear | [04-Customers-Communication-and-Portal-Support.md](04-Customers-Communication-and-Portal-Support.md) |
| Invoice status blocks an action or payment follow-up looks wrong | [05-Invoicing-and-Payments.md](05-Invoicing-and-Payments.md) |
| Materials, reminders, or custom notification actions are missing or failed | [06-Learning-Materials-and-Notifications.md](06-Learning-Materials-and-Notifications.md) |
| Reports, custom ranges, or follow-up summaries look incorrect | [07-Reports-and-Follow-Up.md](07-Reports-and-Follow-Up.md) |
| A settings field is unclear, blank, or appears to have triggered a restart | [08-Settings-and-Configuration.md](08-Settings-and-Configuration.md) |
| You need evidence, metadata, or a formal bug report | [09-Logs-and-Bug-Reporting.md](09-Logs-and-Bug-Reporting.md) |
| VPS installation, update, deploy script, or service checks are involved | [digitalocean-admin-operations.md](digitalocean-admin-operations.md) |

## Common Operator Issues

### I saved settings and got signed out

This is normal when the saved change affects admin identity, credentials, or another setting that forces re-authentication.

Check:

- whether you changed the admin email or password area
- whether the page warned that a restart or credential refresh was queued
- whether the sign-out happened immediately after <code>Save Configuration</code>

Next step:

- sign in again with the new confirmed admin credentials
- reopen [08-Settings-and-Configuration.md](08-Settings-and-Configuration.md) if you need to confirm which setting caused the re-login

### A secret field is blank in Settings

Blank secret inputs usually mean the stored value is masked and preserved unless you deliberately replace it.

Check:

- whether the page says blank secret fields keep the saved value
- whether you actually intend to rotate that secret
- whether a technical-owner-only field is being edited by mistake

Next step:

- leave the field blank if you are not intentionally replacing it
- use [08-Settings-and-Configuration.md](08-Settings-and-Configuration.md) for the field-by-field meaning before saving

### A student cannot log in

Start with the customer record before assuming the portal is broken.

Check:

- whether you are looking at the correct customer record
- whether the portal password was regenerated recently
- whether the student is using the expected name, postcode, and password combination

Next step:

- review [04-Customers-Communication-and-Portal-Support.md](04-Customers-Communication-and-Portal-Support.md)
- then confirm the student-facing flow in [10-Public-Intake-and-Student-Portal.md](10-Public-Intake-and-Student-Portal.md)

### A reminder or email did not behave as expected

Email issues are often workflow-state problems rather than platform failures.

Check:

- whether the item was in a valid state for the action you attempted
- whether the relevant customer email address is present and correct
- whether the action reported a partial-success state or warning

Next step:

- review [06-Learning-Materials-and-Notifications.md](06-Learning-Materials-and-Notifications.md)
- then inspect [09-Logs-and-Bug-Reporting.md](09-Logs-and-Bug-Reporting.md) for delivery or system messages

### The system feels broken, but you are not sure where

When the failure is not obvious, move from symptoms to evidence.

Check:

- which screen you were on
- what the last successful action was
- whether the issue is isolated to bookings, invoices, reports, settings, or login

Next step:

1. reproduce the problem once if safe
2. open [09-Logs-and-Bug-Reporting.md](09-Logs-and-Bug-Reporting.md)
3. search the logs by area or severity
4. escalate with evidence if the cause is still unclear

## What a Good Escalation Includes

Include:

- what you were trying to do
- what you clicked or saved
- what happened instead
- whether the issue repeats
- which customer, booking, invoice, or report was involved
- whether the problem started after settings, updates, or deployment work
- any relevant log events or screenshots

Avoid:

- guessing at the cause without evidence
- changing unrelated settings while troubleshooting
- editing technical-owner-only fields unless the runbook explicitly calls for it

> Do not guess with high-risk actions. If the system is unclear, pause, confirm, and escalate with evidence.
