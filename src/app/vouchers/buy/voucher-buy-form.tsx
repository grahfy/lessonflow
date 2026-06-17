"use client";

import { FormEvent, useState } from "react";

import { formatCurrency } from "@/lib/invoices/currency";

/**
 * Gift-voucher purchase form. The form is a native POST to
 * `/api/public/vouchers/buy` (which validates the server-side allow-listed
 * amount and 303-redirects to Stripe Checkout) so the flow still works without
 * client JS.
 *
 * When JS is available we progressively enhance: the submit is intercepted and
 * sent with `fetch`. A successful response is the followed Stripe redirect — we
 * navigate the browser to its final URL. Any error (rate limit, Stripe failure,
 * unconfigured, validation) is returned as JSON and rendered INLINE in the form
 * with the button re-enabled, rather than navigating the browser to the bare
 * API JSON and losing the buyer's entered details. This mirrors the public pay
 * flow's "money page" UX expectations.
 *
 * The amount options are passed in from the server so the page and the API
 * share one source of truth for denominations.
 */
export function VoucherBuyForm({
  denominations,
  currency,
}: {
  denominations: number[];
  currency: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number>(denominations[0]);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    // No-JS fallback relies on the native POST; once hydrated we take over so a
    // non-redirect response never strands the buyer on raw API JSON.
    event.preventDefault();
    const formElement = event.currentTarget;

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(formElement.action, {
        method: "POST",
        body: new FormData(formElement),
        // fetch follows the 303 to Stripe automatically; on success the final
        // (cross-origin) Stripe URL lands in `response.url`.
        redirect: "follow",
      });

      if (response.ok && response.url) {
        // Hand off to Stripe's hosted checkout page.
        window.location.assign(response.url);
        return;
      }

      const result = (await response.json().catch(() => null)) as
        | { error?: unknown }
        | null;
      const message =
        result && typeof result.error === "string"
          ? result.error
          : "We could not start your purchase. Please try again.";
      setError(message);
      setSubmitting(false);
    } catch {
      setError(
        "We could not start your purchase due to a network error. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      method="post"
      action="/api/public/vouchers/buy"
      className="form-grid voucher-buy-form"
      onSubmit={onSubmit}
    >
      <fieldset className="field full voucher-amount-fieldset">
        <legend>Voucher amount</legend>
        <div className="voucher-amount-options">
          {denominations.map((amount) => (
            <label key={amount} className="voucher-amount-option">
              <input
                type="radio"
                name="valueCents"
                value={amount}
                checked={selectedAmount === amount}
                onChange={() => setSelectedAmount(amount)}
                required
              />
              <span>{formatCurrency(amount, currency)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="voucher-purchaser-name">Your name</label>
        <input
          id="voucher-purchaser-name"
          name="purchaserName"
          type="text"
          autoComplete="name"
          maxLength={200}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="voucher-purchaser-email">Your email (receipt)</label>
        <input
          id="voucher-purchaser-email"
          name="purchaserEmail"
          type="email"
          autoComplete="email"
          maxLength={320}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="voucher-recipient-name">Recipient name</label>
        <input
          id="voucher-recipient-name"
          name="recipientName"
          type="text"
          maxLength={200}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="voucher-recipient-email">Recipient email (where we send the code)</label>
        <input
          id="voucher-recipient-email"
          name="recipientEmail"
          type="email"
          autoComplete="email"
          maxLength={320}
          required
        />
      </div>

      <div className="field full">
        <label htmlFor="voucher-message">Personal message (optional)</label>
        <textarea id="voucher-message" name="message" maxLength={1000} rows={3} />
      </div>

      {error ? (
        <p className="notice error voucher-buy-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="button-row voucher-buy-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Redirecting to secure checkout…" : "Continue to payment"}
        </button>
      </div>
    </form>
  );
}
