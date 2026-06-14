"use client";

import { useState } from "react";

/**
 * Client-side submit button for the public pay form. The form itself is a plain
 * POST to /api/public/invoices/pay (which responds with a 303 redirect to Stripe
 * Checkout), so we let the native submit proceed — we only flip a local
 * `submitting` flag to disable the button and swap its label, preventing
 * double-taps on a money CTA while the redirect is in flight.
 */
export function PayNowButton({ token }: { token: string }) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      method="post"
      action="/api/public/invoices/pay"
      onSubmit={() => setSubmitting(true)}
    >
      <input type="hidden" name="token" value={token} />
      <button type="submit" className="pay-now-button" disabled={submitting}>
        {submitting ? "Redirecting to secure checkout…" : "Pay now"}
      </button>
      {/*
        Scoped styles: this public route renders without app chrome or an imported
        stylesheet, so the button's interaction states live here alongside it.
      */}
      <style>{`
        .pay-now-button {
          width: 100%;
          padding: 0.85rem 1rem;
          font-size: 1rem;
          font-weight: 600;
          color: #ffffff;
          background: #2247d8;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .pay-now-button:hover:not(:disabled) {
          background: #1b3bb8;
        }
        .pay-now-button:focus-visible {
          outline: 3px solid #93c5fd;
          outline-offset: 2px;
        }
        .pay-now-button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
      `}</style>
    </form>
  );
}
