# Updates and Release Visibility

<div class="manual-callout info">
<strong>Purpose:</strong> LessonFlow shows update information inside the admin console so staff and owners can see what changed without guessing whether the system is on a new version.
</div>

This chapter documents the admin-facing update tools, not the server-side installation steps. Technical deployment procedures are covered in [DigitalOcean Admin Operations Runbook](digitalocean-admin-operations.md).

## Update notification banner

When LessonFlow detects new pending commits for the deployed system, a banner can appear in the admin experience announcing that a new version is available.

The banner can show:

- that a new version exists
- how many commits are waiting
- a `View Changes` action

Use this as release awareness, not as confirmation that an update has already been applied.

## Pending changes modal

The pending-changes modal is designed to help admins understand what is waiting to be deployed before they approve or expect a change.

Use it to review:

- commit summaries
- whether web-triggered updates are configured
- whether an owner or technical owner should take action

## Deployment updates button

The admin header includes an `Updates` button that opens the deployment updates dialog.

This dialog is useful after an update has already been applied.

### Tabs available

- `Latest`
- `History`

### Latest tab

The latest tab shows:

- applied date/time
- branch
- release
- current commit
- previous commit
- included commits

This is the fastest place to confirm what code was actually deployed.

### History tab

The history tab lets you review earlier deployments and inspect what commits were included in those releases.

Use it when:

- you need to confirm when a behavior changed
- the owner asks whether a fix has already been deployed
- you are correlating an issue with a recent release

## Auto-open behavior

The updates dialog can auto-open in the browser when a new deployed commit has not been seen yet on that machine. This is expected behavior and is meant to reduce version confusion.

## Live update progress page

When a web-triggered update runs, LessonFlow can show a live update progress page with streamed output.

The progress page can display states such as:

- connecting
- updating
- restarting
- complete
- error

It also shows:

- elapsed time
- estimated build time where available
- streamed log output

<div class="manual-callout warning">
<strong>Do not close the update progress page during an active update unless the technical owner tells you to do so.</strong>
</div>

## What normal admins should do

Normal admins should use the update tools to:

- understand what changed
- verify whether a fix was already deployed
- report what release they are on when escalating an issue

Normal admins should not treat these screens as permission to run infrastructure changes unless they are also the technical owner.

## What technical owners should do

Technical owners can use the update screens to:

- verify deployed commit history
- confirm that a web-triggered update actually ran
- compare current and previous release states
- correlate operational reports with deployment timing

For the actual update procedure, continue to the technical-owner runbook.
