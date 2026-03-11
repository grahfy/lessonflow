# First-Time Setup and Admin Access

<div class="manual-callout warning">
<strong>Audience:</strong> The setup wizard is usually completed once by the owner or technical owner. Normal day-to-day staff usually start at the admin login screen.
</div>

This chapter covers two entry states:

1. the system has not been initialized yet, so `/admin` redirects to `/setup`
2. the system is already live, so staff sign in at `/admin/login`

## If LessonFlow is not set up yet

When setup is incomplete, visiting `/admin` sends you to the LessonFlow Setup Wizard.

### What the setup wizard does

- runs readiness checks
- lets you review and save environment-backed configuration
- creates the first admin user
- redirects into the admin console when initialization succeeds

### Readiness checks

The setup wizard shows checks with `pass`, `warn`, or `fail` states. Re-run checks whenever you change environment values.

Use the checks list to confirm:

- database connectivity is working
- the site URL is valid
- required secrets exist
- the server environment is in a usable state

### Environment configuration panel

Open the environment section when the checks show missing or invalid configuration. Save changes there before trying to initialize the system.

Use `Re-run checks` after saving so the wizard reads the latest server state.

### First admin creation

Once readiness allows initialization, create the first admin account by entering:

- display name
- email
- password
- password confirmation

If initialization succeeds, LessonFlow redirects you into the admin console.

## Admin login

Use `/admin/login` after setup is complete.

### What you need

- admin email
- admin password

The login page is protected by the admin session system. If the email or password is changed in Settings, all admins should expect to sign in again.

## Sign out and session behavior

Use the `Sign out` button in the admin header when you finish work, especially on shared or staff-facing machines.

Sessions can end because of:

- manual sign out
- credential rotation
- admin email changes
- session expiry or server restart

If you are unexpectedly returned to `/admin/login`, sign back in first. If the problem repeats, continue with [Logs and Bug Reporting](09-Logs-and-Bug-Reporting.md).

## Safe first-day checklist

1. Confirm you can sign in.
2. Open `Bookings`, `Customers`, `Invoices`, `Reports`, `Logs`, `Manual`, and `Settings`.
3. Check that the screen headings and navigation behave normally.
4. Read the first sections of the manual before making live changes.

```text
Recommended first-day path:
/admin/login -> /admin/bookings -> /admin/customers -> /admin/invoices -> /admin/reports
```
