# 08. Settings and Configuration

<div class="manual-callout warning">
<strong>High-impact area:</strong> Settings control public branding, invoices, email delivery, secrets, and admin identity. Save carefully, because some changes can trigger a service restart or force you to sign in again.
</div>

## What This Area Lets You Do

- update public branding details
- edit structured page content
- edit automated email templates
- control invoice payment and branding defaults
- manage product presets
- review Gmail connection status
- update system-level configuration
- rotate admin credentials

![Admin settings page](assets/admin-settings-page.png)

## Shared Settings Behaviors

Before looking at each tab, remember these rules:

- <code>Save Configuration</code> applies the current environment-backed form fields.
- secret fields may appear blank even when already stored
- leaving a masked secret blank keeps the current value
- invalid input returns field-level validation errors
- saving some settings queues a systemd restart
- changing admin identity or password can force re-authentication

## Branding Tab

### Group: Branding & Identity

This group controls the public-facing identity of the school.

| Field | What it controls |
| --- | --- |
| `NEXT_PUBLIC_BRAND_NAME` | Public school or studio name |
| `NEXT_PUBLIC_PRIMARY_SUBJECT` | Main subject or instrument taught |
| `NEXT_PUBLIC_PRIMARY_LOCATION` | Main location shown across the site |
| `NEXT_PUBLIC_LOGO_URL` | Main brand logo |
| `NEXT_PUBLIC_INVOICE_LOGO_URL` | Logo used for invoice output |
| `NEXT_PUBLIC_FAVICON_URL` | Site favicon |
| `NEXT_PUBLIC_CONTACT_PHONE` | Public phone contact |
| `NEXT_PUBLIC_CONTACT_ADDRESS` | Public address shown to visitors |

Use this tab when rebranding the school, changing contact details, or aligning public-facing assets across the site and invoices.

## Pages Tab

### Editor: Page Content

This is not a simple page builder. It is a structured content editor backed by JSON-like content blocks.

Each content block includes:

- <strong>Page Path</strong> - the route where the content appears
- <strong>Section Key</strong> - the internal identifier for that content block
- <strong>Section Content (JSON)</strong> - the structured content value

Available action:

- <code>Save All Content</code>

Use this editor only when you are confident editing structured content. Invalid JSON blocks the save.

## Emails Tab

### Editor: Email Templates

This area controls automated email copy.

Each template editor includes:

- template key/title
- subject field
- HTML body field

Available action:

- <code>Save All Templates</code>

Template body notes:

- subjects control the email heading shown to the recipient
- the HTML body controls the rendered email content
- placeholder tokens should be preserved when they are required for dynamic content

Use this area for tone changes, wording fixes, and automated email improvements. Do not remove required placeholders casually.

## Invoices Tab

### Group: Invoices & Payments (Taxation)

These fields define invoice defaults and payment details.

| Field | What it controls |
| --- | --- |
| `INVOICE_BUSINESS_NAME` | Business name printed on invoices |
| `INVOICE_BUSINESS_ABN` | Optional ABN shown on invoices |
| `INVOICE_BANK_NAME` | Bank name for payment instructions |
| `INVOICE_BANK_BSB` | BSB shown on invoices |
| `INVOICE_BANK_ACCOUNT_NAME` | Account name for payment |
| `INVOICE_BANK_ACCOUNT_NUMBER` | Account number for payment |
| `INVOICE_PAYMENT_TERMS_DAYS` | Default payment due period |
| `INVOICE_GST_REGISTERED` | Whether GST is enabled for the business |
| `INVOICE_DEFAULT_TAX_MODE` | Default invoice tax mode |
| `INVOICE_CREDIT_NOTE_PREFIX` | Prefix used for credit notes |
| `NEXT_PUBLIC_DEFAULT_CURRENCY` | Default currency code |

### Editor: Invoice Content & Terms

This editor has three parts:

#### Branding

- Logo URL
- Accent Color

#### Header Info

- line-separated business details shown near the top of invoices

#### Footer Terms

- notes, payment terms, and footer copy shown at the bottom of invoices

Available action:

- <code>Save All Content</code>

Use this tab when invoice appearance, payment instructions, or invoice policy wording changes.

## Products Tab

### Editor: Product Presets

Presets are reusable billing templates for common line items.

Each existing preset contains:

- label
- price (AUD)
- default description

Available actions:

- <code>Save Preset</code>
- <code>Delete Preset</code>

There is also an <strong>Add New Preset</strong> panel with:

- label
- price
- default description
- <code>Add Preset</code>

Use presets to standardize lesson packages, tuition types, and common products so invoices are faster and more consistent.

## System Tab

<div class="manual-callout warning">
<strong>Technical-owner zone:</strong> Many fields on this tab affect database access, session security, email transport, and host behavior. Only change them if you understand the operational impact.
</div>

### Group: Core System

| Field | What it controls |
| --- | --- |
| `DATABASE_URL` | Database connection target |
| `NEXT_PUBLIC_SITE_URL` | Public site URL |
| `ADMIN_EMAIL` | Admin login and notification email |

### Group: Email Delivery

This group supports Gmail API and SMTP delivery paths.

| Field | What it controls |
| --- | --- |
| `GMAIL_CLIENT_ID` | Gmail API client id |
| `GMAIL_CLIENT_SECRET` | Gmail API client secret |
| `GMAIL_REFRESH_TOKEN` | Gmail API refresh token |
| `GMAIL_USER_EMAIL` | Gmail sender address |
| `SMTP_HOST` | SMTP host |
| `SMTP_PORT` | SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address/display sender |

This group also includes the <strong>Gmail API Status</strong> card with:

- connection status indicator
- authorized sender address when connected
- refresh/check button

### Group: Security & Encryption

| Field | What it controls |
| --- | --- |
| `ADMIN_SESSION_SECRET` | Admin session signing |
| `STUDENT_SESSION_SECRET` | Student portal session signing |
| `STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY` | Encryption for stored portal credentials |
| `CRON_SECRET` | Protection for scheduled job endpoints |

### Group: Student Portal (Access Control)

| Field | What it controls |
| --- | --- |
| `STUDENT_SESSION_MAX_AGE_SECONDS` | Portal session duration |
| `STUDENT_PORTAL_PASSWORD_LENGTH` | Generated portal password length |

### Admin Password Management

This card includes:

- New Password
- Confirm New Password
- <code>Rotate Credentials</code>

Use it when the admin password must be changed. Expect to sign in again afterward.

## When to Use Each Tab

- <strong>Branding:</strong> public identity and contact details
- <strong>Pages:</strong> structured content updates
- <strong>Emails:</strong> automated email wording
- <strong>Invoices:</strong> billing defaults and invoice presentation
- <strong>Products:</strong> reusable billing presets
- <strong>System:</strong> infrastructure, security, delivery, and admin credentials

## Safe Settings Checklist

1. Confirm you are in the correct tab.
2. Change only the fields relevant to the task.
3. If a secret field was already set, leave it blank unless you intend to replace it.
4. Save once and read the response message carefully.
5. If the save warns about restart or re-login, treat that as expected system behavior and verify it.

```text
Typical save outcomes:
- "Settings saved."
- "Settings saved. Restarting the systemd service now."
- "Settings saved. Identity changed, please sign in again."
```

## Escalate When

- a system field is unclear
- save errors mention secrets, database, or restart failure
- Gmail or SMTP changes break delivery
- rotating credentials causes access problems
