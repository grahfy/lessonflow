# Troubleshooting and Quick Reference

Troubleshooting in LessonFlow is designed to begin with observed symptoms and move toward evidence, not speculation. This chapter acts as the manual’s quick-reference article for common operator issues, first checks, and escalation standards.

<div class="manual-callout warning">
<strong>Reference principle:</strong> Where a problem is unclear, the safest path is to identify the symptom, locate the most relevant chapter, and then use the Logs page if the explanation remains incomplete.
</div>

## Symptom Map

| Symptom | First reference |
| --- | --- |
| Setup loops or repeated “setup incomplete” messaging | [First-Time Setup and Admin Access](02-First-Time-Setup-and-Admin-Access.md) |
| Booking request, lesson move, or calendar action behaves unexpectedly | [Daily Operations and Booking Lifecycle](03-Daily-Operations-and-Booking-Lifecycle.md) |
| Customer profile, portal password, or manual email support is unclear | [Customers, Communication, and Portal Support](04-Customers-Communication-and-Portal-Support.md) |
| Invoice status or follow-up behaviour appears wrong | [Invoicing and Payments](05-Invoicing-and-Payments.md) |
| Materials or notification actions appear missing or failed | [Learning Materials and Notifications](06-Learning-Materials-and-Notifications.md) |
| Reports or custom-range summaries look incorrect | [Reports and Follow-Up](07-Reports-and-Follow-Up.md) |
| A settings field is unclear or a save appears to trigger a restart | [Settings and Configuration](08-Settings-and-Configuration.md) |
| Evidence, metadata, or formal escalation is required | [Logs and Bug Reporting](09-Logs-and-Bug-Reporting.md) |
| Installation, update, or host-service work is involved | [Technical Owner Runbook: Installation, Updates, and Deploy Scripts](digitalocean-admin-operations.md) |

## Common Operator Issues

### Re-authentication After Settings Save

Re-authentication after a settings save is often normal when admin identity or credential-related values were changed.

Relevant checks:

- whether the admin email or password area was edited
- whether the save response warned about restart or credential refresh
- whether the sign-out occurred immediately after save

### Blank Secret Fields

Blank secret inputs usually indicate masked preservation rather than missing data. If the intention is not to rotate the secret, the field should ordinarily be left blank.

### Student Cannot Log In

Portal-access problems should first be interpreted as customer-record or credential issues rather than immediate evidence of a portal outage.

Relevant checks:

- whether the correct customer record is open
- whether the password was recently regenerated
- whether the student is using the expected combination of name, postcode, and password

### Reminder or Email Behaviour Appears Wrong

Email issues are often caused by invalid workflow state, incorrect address data, or partial-success conditions rather than a full delivery-system failure.

### Chord Preview Is Silent

The chord builder preview depends on browser audio playback, so silence is not always evidence that the chord data is wrong.

Relevant checks:

- whether the `Strum` or `Play Notes` button was clicked directly, which unlocks browser audio on first use
- whether the device, browser tab, or system output is muted
- whether the current chord shape still has sounding strings rather than every string muted
- whether a temporary “Loading guitar samples...” message appeared before the first preview

### The Failure Is Unclear

When the category of failure is not obvious, the recommended progression is:

1. identify the last known successful action
2. determine which screen or domain was involved
3. reproduce the issue once if safe
4. inspect [Logs and Bug Reporting](09-Logs-and-Bug-Reporting.md)
5. escalate with evidence if uncertainty remains

## Escalation Standard

A good escalation usually includes:

- what the operator was attempting to do
- what was clicked, saved, or submitted
- what happened instead
- whether the issue repeats
- which customer, booking, invoice, or report was involved
- whether the problem began after settings or release activity
- any relevant log events or screenshots

Guesses about root cause should be avoided when evidence is not yet available.

## Related Sections

- [Logs and Bug Reporting](09-Logs-and-Bug-Reporting.md)
- [Updates and Release Visibility](11-Updates-and-Release-Visibility.md)
- [Technical Owner Runbook: Installation, Updates, and Deploy Scripts](digitalocean-admin-operations.md)
