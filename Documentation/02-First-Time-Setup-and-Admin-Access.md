# First-Time Setup and Admin Access

First-time setup and admin access define the two principal entry states of LessonFlow: an uninitialised installation that requires setup, and an operational installation that routes administrators through the sign-in flow. This chapter describes the setup wizard, the normal login pathway, and the session behaviours that administrators are expected to encounter.

<div class="manual-callout warning">
<strong>Audience note:</strong> The setup wizard is ordinarily completed once by an owner or technical owner. Most staff begin their work at <code>/admin/login</code> after the system has already been commissioned.
</div>

## Entry States

LessonFlow distinguishes between the following entry conditions:

| State | Typical route behaviour | Intended operator |
| --- | --- | --- |
| Uninitialised system | <code>/admin</code> redirects to <code>/setup</code> | Owner or technical owner |
| Operational system | <code>/admin/login</code> provides the sign-in form | Administrators and owners |

This distinction prevents routine staff from operating a system that has not yet completed its baseline configuration.

## Setup Wizard

When setup is incomplete, the Setup Wizard becomes the authoritative path for initialisation. Its purpose is to confirm runtime readiness, persist environment-backed configuration, and create the first administrative account.

### Readiness Checks

The readiness interface reports results as <code>pass</code>, <code>warn</code>, or <code>fail</code>. These checks are intended to confirm that the environment is viable before initialisation proceeds.

Operators should use the checks to confirm:

- database connectivity
- site URL validity
- presence of required secrets
- general server readiness

The checks should be re-run after configuration changes so the wizard reflects the latest environment state.

### Environment Configuration

The environment configuration panel is used when readiness checks indicate missing or invalid values. It is designed for controlled correction of installation settings prior to first use.

The expected sequence is:

1. review the failing or warning check
2. update the relevant configuration value
3. save the configuration
4. re-run checks
5. continue only once the installation is in a usable state

### First Admin Creation

Initialisation concludes with creation of the first admin account. The wizard requires:

- display name
- email address
- password
- password confirmation

On success, LessonFlow redirects to the admin console and the setup state is treated as complete.

## Admin Login

The normal administrative entry point is <code>/admin/login</code>. The login form expects the current admin email address and password associated with the installation.

Administrative sessions are tied to the current credential state. If those credentials change in Settings, a fresh login should be expected.

## Session and Sign-Out Behaviour

Session termination may occur under several normal conditions:

| Cause | Description |
| --- | --- |
| Manual sign-out | The user chose to end the session from the admin header |
| Credential rotation | The password or related authentication material changed |
| Admin identity change | The configured admin email changed |
| Expiry or restart | The session ended because of runtime lifecycle behaviour |

Unexpected return to <code>/admin/login</code> is therefore not always evidence of failure. Administrators should first sign in again and then escalate only if the behaviour repeats without a clear cause.

## Initial Verification

The first day of use should include a basic verification pass across the principal admin areas:

1. sign in successfully
2. open Bookings, Customers, Invoices, Reports, Logs, Manual, and Settings
3. confirm headings, navigation, and page shells render normally
4. read the opening chapters of the manual before making live changes

```text
Typical first-day path:
/admin/login -> /admin/bookings -> /admin/customers -> /admin/invoices -> /admin/reports
```

## Related Sections

- [Start Here and Features](01-Start-Here-and-Features.md)
- [Settings and Configuration](08-Settings-and-Configuration.md)
- [Logs and Bug Reporting](09-Logs-and-Bug-Reporting.md)
