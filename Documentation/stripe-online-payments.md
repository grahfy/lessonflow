# Stripe Online Payments

This document covers enabling and operating Stripe-powered online invoice payments in LessonFlow. The feature is entirely optional: the app runs normally when Stripe is not configured, and the manual bank-transfer payment flow continues to work regardless of Stripe status.

## How the feature works

When Stripe is enabled, a sent invoice includes a tokenized "Pay online" link in the email and PDF. The customer follows the link to a public pay page, clicks "Pay now", and is redirected to Stripe Hosted Checkout. After a successful payment, Stripe sends a webhook that marks the invoice paid automatically. No customer login is required.

The manual payment path (bank transfer + admin "Mark paid") continues to work alongside online payments and is not affected by Stripe enablement.

## Prerequisites

`NEXT_PUBLIC_SITE_URL` must be set to the real `https://` domain before enabling Stripe. The pay page, email pay link, and PDF link are all derived from this value. If it is unset or left at the default, pay links will point to `http://127.0.0.1:3000`, which will not work for customers.

```env
NEXT_PUBLIC_SITE_URL="https://yourdomain.com"
```

## Enabling Stripe in production

### 1. Create a Stripe account and get your secret key

Sign in at [dashboard.stripe.com](https://dashboard.stripe.com), then go to **Developers → API keys** and copy the **Secret key** (`sk_live_...` for live mode).

### 2. Register the webhook endpoint

In the Stripe Dashboard go to **Developers → Webhooks → Add endpoint**.

- **Endpoint URL**: `https://yourdomain.com/api/webhooks/stripe`
- **Events to listen for**: `checkout.session.completed`

After saving, Stripe shows the **Signing secret** (`whsec_...`). Copy it.

### 3. Add the keys to the production environment

Edit `/var/www/lessonflow/shared/.env`:

```env
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

Then restart the app service:

```bash
sudo systemctl restart lessonflow
```

### 4. Apply the database migration

The Stripe feature adds columns to the `Invoice` table and a toggle to `NotificationSettings`. These are additive changes — safe to apply against live data.

```bash
cd /var/www/lessonflow/current
sudo -u www-data npx prisma migrate deploy
```

This runs automatically as part of `deploy/update.sh` on the next normal deploy if you prefer to apply it then instead.

### 5. Verify the webhook

Send a test event from the Stripe Dashboard (**Developers → Webhooks → your endpoint → Send test event**, event type `checkout.session.completed`) and confirm the endpoint responds with `200`.

You can also check the app logs:

```bash
sudo journalctl -u lessonflow -f | grep stripe
```

## Behaviour when Stripe is not configured

If `STRIPE_SECRET_KEY` is absent:

- "Pay online" links are omitted from invoice emails and PDFs.
- The public pay page (`/pay/[token]`) shows an "unavailable" message rather than a payment option.
- The webhook endpoint (`/api/webhooks/stripe`) returns `503` rather than processing events.
- All other invoice and booking workflows are unaffected.

## How a customer pays

1. Admin sends an invoice from the invoices console.
2. The customer receives an email with a "Pay online" link (and optionally a PDF with the same link).
3. The customer follows the link to the public pay page — no login required.
4. The customer clicks "Pay now". The server creates a Stripe Checkout Session and redirects them to the Stripe-hosted payment form.
5. After a successful card payment, Stripe sends a `checkout.session.completed` webhook to LessonFlow.
6. LessonFlow verifies the signature, confirms the amount and currency match the invoice, and marks the invoice paid. The audit log records "Invoice marked as paid via Stripe".
7. The customer is redirected to a confirmation page.

Repeated "Pay now" clicks for the same invoice and amount reuse the same Checkout Session rather than creating duplicates. If the invoice total changes between clicks a fresh session is created.

## Auto-invoicing toggle

Auto-invoicing creates a **draft invoice** automatically when a booking request is approved. It does not send the invoice — draft review and send remain manual steps.

To enable it: go to **Admin → Settings → Notifications** and turn on **"Auto-create draft invoice on approval"**. The toggle is off by default.

When enabled, the draft is built from the booking's lesson pricing after the approval transaction commits. If invoice creation fails (for example, a pricing gap) the approval is not rolled back — the failure is logged and the booking remains approved. The admin can create the invoice manually in that case.

Approved bookings that lack an active invoice show an "unbilled" indicator in the bookings calendar.

## Env var reference

| Variable | Required | Description |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | When using Stripe | Server-side secret key (`sk_live_...` or `sk_test_...`). Stripe is disabled when absent. |
| `STRIPE_WEBHOOK_SECRET` | When using Stripe | Signing secret (`whsec_...`) for webhook signature verification. Required alongside the secret key. |
| `NEXT_PUBLIC_SITE_URL` | Always (critical for payments) | Public `https://` domain. Pay links, email links, and PDF links are derived from this value. Falls back to `http://127.0.0.1:3000` when unset. |

## Using test mode

Stripe test mode works with the same setup. Use `sk_test_...` as `STRIPE_SECRET_KEY` and a test-mode webhook endpoint. Stripe's test card `4242 4242 4242 4242` (any future expiry, any CVC) completes a payment without real charges.
