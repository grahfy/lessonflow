# Logs and Bug Reporting

The Logs page is the principal diagnostic surface available to administrators inside LessonFlow. It is intended to confirm what the system recently did, expose relevant metadata, and support evidence-based issue reporting when normal operation becomes unclear.

<div class="manual-callout info">
<strong>Diagnostic principle:</strong> The Logs page is designed to replace guesswork with evidence. It should be the first escalation surface for unexplained behaviour that cannot be resolved through ordinary workflow review.
</div>

## Logs Page Functions

The page supports:

- search across recent events
- severity filtering
- paged review of older results
- expansion of structured metadata
- submission of issue reports
- optional screenshot attachment

## Toolbar Elements

| Control | Function |
| --- | --- |
| Search field | Find events by identifier, source, or workflow term |
| Level filter | Narrow results to Info, Warning, Error, or all levels |
| `REFRESH` | Reload the current result set |
| `REPORT ISSUE` | Open the technical issue dialog |

## Reading Log Entries

The logs table typically includes timestamp, level, source, event identifier, and message. Where metadata exists, the row can be expanded to show a fuller structured record.

Expanded metadata is especially useful when the short message alone does not identify the affected workflow or object.

## First Diagnostic Pass

When a workflow behaves unexpectedly, the recommended first pass is:

1. open the Logs page
2. filter to <code>Error</code> or <code>Warning</code> where appropriate
3. search by the relevant area, such as booking, invoice, portal, report, or settings
4. expand matching rows
5. determine whether the behaviour is isolated, repeated, or associated with a recent change

## Issue Reporting

The issue-report dialog includes:

- subject
- reply email
- description
- optional screenshot
- automatic inclusion of recent logs

Good issue reports identify the attempted action, the observed result, whether it repeats, and which record or screen was involved.

<div class="manual-callout warning">
<strong>Privacy note:</strong> Secrets, passwords, and unrelated personal information should not be pasted into the report. Only the minimum evidence necessary to explain the failure should be included.
</div>

## Escalation Conditions

Escalation to a technical owner or developer is warranted when:

- the same error recurs
- a settings save appears to have broken another workflow
- release or restart activity aligns with the failure
- the message indicates database, email-delivery, or infrastructure trouble
- normal lesson operations, billing, or login access cannot continue safely

## Related Sections

- [Settings and Configuration](08-Settings-and-Configuration.md)
- [Updates and Release Visibility](11-Updates-and-Release-Visibility.md)
- [Troubleshooting and Quick Reference](13-Troubleshooting-and-Quick-Reference.md)
