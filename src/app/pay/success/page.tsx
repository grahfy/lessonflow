import type { Metadata } from "next";

import { StatusShell } from "../_components/status-shell";

export const metadata: Metadata = {
  title: "Payment received",
  robots: { index: false, follow: false },
};

type SuccessPageProps = {
  searchParams: Promise<{ invoice?: string }>;
};

/**
 * Landing page after a successful Stripe Checkout. Purely informational; the
 * authoritative paid state is set by the webhook, not by this redirect.
 */
export default async function PaySuccessPage({ searchParams }: SuccessPageProps) {
  const { invoice } = await searchParams;
  return (
    <StatusShell title="Payment received">
      <p style={{ marginTop: 0 }}>
        Thank you{invoice ? <> for paying invoice <strong>{invoice}</strong></> : null}.
        Your payment was successful and a receipt will be sent to you by Stripe.
      </p>
    </StatusShell>
  );
}
