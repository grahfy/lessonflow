# Packages, Lesson Credits, and Vouchers

This document covers two related prepayment features added to LessonFlow: prepaid lesson packages (which grant lesson credits) and gift vouchers (which grant monetary account credit). Both are optional — the app runs normally without them, and the manual booking and invoicing flows are unaffected.

## Lesson packages and credits

### How packages and credits work

A **lesson package** is a product definition: a named bundle of lessons at a given price. When a customer pays an invoice that includes a package line item, LessonFlow automatically grants them a **credit batch** — a bank of prepaid lessons attributed to that customer. Credits can also be granted manually by an admin.

When a booking is created for a customer who has matching, unexpired credits, one credit is consumed automatically and the booking is marked as credit-covered. Credit-covered bookings are skipped by auto-invoicing so the customer is not billed twice.

### Defining packages

Go to **Admin → Settings → Packages** to manage the package catalogue.

Each package has:

| Field | Required | Notes |
| --- | --- | --- |
| Label | Yes | Display name, e.g. "10-lesson block" |
| Description | No | Shown on invoices and in the admin catalogue |
| Lesson count | Yes | Number of credits granted per unit purchased |
| Duration (minutes) | No | When set, credits only apply to bookings of this exact duration. Leave blank to accept any duration. |
| Price (dollars) | Yes | The price per package unit as entered on an invoice line item |
| Validity (days) | No | Credits expire this many days after being granted. Leave blank for no expiry. |

Packages can be deactivated but not deleted — deactivating hides them from the invoice line-item picker while preserving the history of any grants already made.

### Granting lesson credits

Credits reach a customer in two ways:

**Automatic grant on invoice payment.** When an invoice containing a package line item is marked paid (either manually or via Stripe), LessonFlow automatically grants the corresponding credit batch to the invoice's customer. A quantity of N on the line item grants N × package.lessonCount credits. The grant is idempotent — paying the same invoice twice (e.g. via both the admin "Mark paid" action and a Stripe webhook delivery) creates exactly one batch, not two.

**Manual admin grant.** On a customer's profile page, open the **Lesson credits** panel and click **Grant credits**. You can either:
- Pick an existing package from the dropdown (the package's lesson count, duration, and validity are applied automatically), or
- Enter a custom lesson count, optional duration filter, and optional expiry date.

An optional note can be added to either type of grant for audit purposes.

### Credit consumption on booking

When a booking is created or a booking request is approved, LessonFlow checks whether the customer holds any matching, non-expired credits:

- Credits whose `durationMinutes` matches the booking duration are preferred over credits with no duration restriction.
- Among eligible batches, the one expiring soonest is consumed first (FIFO by expiry, then by creation date).
- The decrement is atomic: if two bookings are created concurrently for the same customer, each consumes a separate credit and neither over-draws the batch.

If a credit is consumed, the booking's invoice is suppressed — auto-invoicing skips credit-covered bookings.

### Where credits are shown

- **Admin — customer profile**: the Lesson credits panel shows all batches (active, expired, and depleted), their source (package purchase or admin grant), remaining quantity, and expiry.
- **Student portal**: the portal displays a summary of currently usable credits ("X lessons remaining") broken down by batch.

---

## Gift vouchers

### How vouchers work

A **voucher** is a bearer code with a monetary value. When redeemed, the voucher's value is added to the customer's **account credit balance**. Account credit can then be applied to an invoice by an admin in one click, reducing the invoice total by up to the available balance.

Vouchers can reach customers in two ways: online purchase via Stripe, or a complimentary voucher issued directly by an admin.

### Online voucher purchase (Stripe)

The public `/vouchers` page links to the internal `/vouchers/buy` page. No login is required.

The buyer selects a denomination ($50, $100, $150, $200, $300, or $500), enters purchaser and recipient details, and submits the form. The server creates a pending voucher record and redirects the buyer to Stripe Hosted Checkout. After successful payment, Stripe sends a webhook to LessonFlow, which:

1. Verifies the webhook signature (same `STRIPE_WEBHOOK_SECRET` and `/api/webhooks/stripe` endpoint as invoice payments — no separate setup required).
2. Confirms the paid amount and currency match the voucher.
3. Activates the voucher (flips status from `pending` to `active`).
4. Emails the voucher code to the recipient's email address.

The activation and code email happen exactly once even if Stripe delivers the webhook multiple times.

**Stripe configuration is shared with invoice payments.** If you have already set up Stripe for online invoice payments (see [Stripe Online Payments](stripe-online-payments.md)), no additional keys or webhook endpoints are needed. The existing `/api/webhooks/stripe` endpoint handles both invoice checkout sessions (identified by `metadata.invoiceId`) and voucher checkout sessions (identified by `metadata.voucherId`). The only additional event to listen for may already be covered; verify that your webhook subscription includes `checkout.session.completed`.

If Stripe is not configured, the voucher buy page is unavailable and returns a 503 response. Everything else continues to work normally.

### Complimentary vouchers (admin-issued)

Go to **Admin → Vouchers** and click **Issue comp voucher**.

Enter the value (in dollars), and optionally a recipient name and email. The voucher is created immediately with `active` status — no payment is required. The full voucher code is shown once on creation; it is partially masked in the management list thereafter.

The recipient email is optional for comp vouchers. If provided, consider sharing the code with the recipient directly.

### Voucher expiry

All vouchers — both purchased and comp-issued — expire **six calendar months** after the date of issue. This matches the six-month validity stated in the public Terms of Service. Expiry is checked at the point of redemption; no batch job is required to mark vouchers expired.

### Voucher management (admin)

**Admin → Vouchers** shows all vouchers (newest first, up to 500 records) with their status, value, purchaser/recipient details, and masked code. Statuses:

| Status | Meaning |
| --- | --- |
| `pending` | Created for an online purchase; awaiting Stripe payment confirmation |
| `active` | Usable — either a fulfilled online purchase or an admin comp voucher |
| `redeemed` | Applied to a customer account credit; value has been transferred |
| `void` | Cancelled by an admin; cannot be redeemed |

To see the full code for an active voucher, open its detail view. The list intentionally masks all but the last group of each code to prevent accidental exposure.

To void a voucher, open its detail view and use the **Void** action.

### Redeeming a voucher (admin path)

To apply a voucher to a customer's account credit balance from the admin side:

1. Open the customer's profile.
2. In the **Account credit** panel, enter the voucher code and click **Redeem**.
3. If the voucher is valid, active, and unexpired, its value is added to the customer's account credit balance immediately.

Alternatively, you can redeem from **Admin → Vouchers** using the redeem action on the voucher detail page.

A voucher can only be redeemed once. Attempting to redeem an already-redeemed, voided, pending, or expired voucher returns a generic error (no information about why it was rejected is given to the caller, to prevent code-guessing).

### Student self-redemption (portal)

A student can redeem a voucher from the student portal under **Redeem a voucher**. They enter the code; on success, the value appears immediately in their **Account credit** balance. The same single-redemption and expiry rules apply.

### Applying account credit to an invoice

Account credit does not apply automatically. An admin applies it manually from the invoice detail page:

1. Open the invoice (must be in Draft or Sent status).
2. The **Account credit** panel shows the customer's available balance.
3. Click **Apply credit**. LessonFlow applies `min(balance, remaining invoice total)` as a fixed-amount discount and debits the ledger by the same amount.
4. The invoice total updates immediately; the audit log records the applied amount.

Notes:
- Account credit cannot be applied to a paid or voided invoice.
- If the invoice already has a percentage discount, credit application is blocked. Switch the invoice to a fixed-amount discount first.
- The ledger debit and invoice update happen in a single atomic transaction, so two concurrent applications cannot double-spend the same credit.

---

## Stripe webhook note

The Stripe webhook endpoint (`/api/webhooks/stripe`) now handles two event types:

- **Invoice checkout sessions** (`metadata.invoiceId`): marks the invoice paid and auto-grants lesson credits if the invoice contains package line items.
- **Voucher checkout sessions** (`metadata.voucherId`): activates the voucher and emails the code to the recipient.

Both branches run through the same endpoint and use the same `STRIPE_WEBHOOK_SECRET`. No additional webhook endpoint registration is required.

If you are enabling Stripe for the first time, follow the setup steps in [Stripe Online Payments](stripe-online-payments.md). Those steps configure everything needed for both invoice payments and voucher purchases.

---

## Env var reference

No new environment variables are required for packages, credits, or vouchers beyond those already documented in [Stripe Online Payments](stripe-online-payments.md):

| Variable | Notes |
| --- | --- |
| `STRIPE_SECRET_KEY` | Required for online voucher purchase. Shared with invoice payments. |
| `STRIPE_WEBHOOK_SECRET` | Required for online voucher purchase. Shared with invoice payments. |
| `NEXT_PUBLIC_SITE_URL` | Required. Voucher success/cancel redirect URLs and the redemption link in the gift email are derived from this value. |

---

## Related sections

- [Stripe Online Payments](stripe-online-payments.md)
- [Invoicing and Payments](05-Invoicing-and-Payments.md)
- [Customers, Communication, and Portal Support](04-Customers-Communication-and-Portal-Support.md)
- [Settings and Configuration](08-Settings-and-Configuration.md)
