# 09. Logs and Bug Reporting

<div class="manual-callout info">
<strong>Purpose:</strong> The Logs page is where you confirm what the system recently did. Use it when a workflow fails, behaves unexpectedly, or needs evidence before escalation.
</div>

## What This Area Lets You Do

- search recent system events
- filter by severity
- page through historical log results
- expand logs that contain structured metadata
- submit a technical issue report
- attach a screenshot to the report

## The Logs Toolbar

The toolbar includes:

- search field
- level filter
- <code>REFRESH</code>
- <code>REPORT ISSUE</code>

### Search field

Use search to look for an event name or identifier related to the problem you are investigating.

### Level filter

Available values:

- All Levels
- Info
- Warning
- Error

Use this to narrow the list to the most relevant severity.

### Refresh

Use <code>REFRESH</code> to reload the current results from the server.

### Report Issue

Use <code>REPORT ISSUE</code> when the problem needs developer or technical-owner follow-up.

## Reading the Logs Table

The table shows:

- timestamp
- level
- source
- event id
- message

If a row contains metadata, it can be expanded to reveal a formatted metadata block. Use that when the short message does not explain enough on its own.

## Pagination and Result Size

The page includes pagination controls and page-size options. Use these when:

- you need older events
- your filter matches many results
- you want a denser or broader view

## What to Check First

When something fails:

1. open the Logs page
2. filter to <code>Error</code> or <code>Warning</code> if appropriate
3. search by the workflow area, such as booking, invoice, report, portal, or settings
4. expand any row that looks related
5. confirm whether the problem is one-off, repeated, or connected to a recent update

## Report Issue Dialog

The issue-report form includes:

- Subject
- Your Email
- Description
- optional screenshot attachment
- automatic inclusion of recent logs

Required minimums:

- subject long enough to explain the issue briefly
- valid reply email
- description long enough to describe what happened

The screenshot attachment accepts image files only. Oversized screenshots are rejected.

## What Makes a Good Bug Report

Include:

- what you were trying to do
- what you clicked
- what happened instead
- whether it happens every time
- which record or screen was involved
- whether the issue started after a recent update

Good example:

> I opened a sent invoice, clicked `Mark Paid`, and the dialog closed but the invoice still showed as sent after refresh. This happened twice on the same invoice after the update banner appeared this morning.

Poor example:

> Invoices broken.

## When to Escalate

Escalate to the technical owner or developer when:

- the same error keeps reappearing
- a settings save appears to break another workflow
- update or restart activity lines up with the failure
- the message suggests infrastructure, email delivery, or database trouble
- you cannot safely continue normal operations without clarification

<div class="manual-callout warning">
<strong>Important:</strong> Do not paste secrets, passwords, or unrelated personal information into the bug report. Describe the workflow and attach only the minimum evidence needed.
</div>

## Suggested Workflow for Operators

1. Reproduce the issue once if safe.
2. Check the Logs page.
3. Expand any relevant metadata row.
4. Submit a report with the clearest possible subject and description.
5. Tell the technical owner if the issue blocks lesson operations, billing, or login access.
