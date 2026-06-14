import type { Metadata } from "next";

import { StatusShell } from "../_components/status-shell";

export const metadata: Metadata = {
  title: "Payment cancelled",
  robots: { index: false, follow: false },
};

type CancelledPageProps = {
  searchParams: Promise<{ invoice?: string }>;
};

/**
 * Landing page when a payer cancels Stripe Checkout. No state changes; they can
 * reopen the original pay link to try again.
 */
export default async function PayCancelledPage({ searchParams }: CancelledPageProps) {
  const { invoice } = await searchParams;
  return (
    <StatusShell title="Payment cancelled">
      <p style={{ marginTop: 0 }}>
        Your payment{invoice ? <> for invoice <strong>{invoice}</strong></> : null}{" "}
        was cancelled and you have not been charged. You can reopen your payment
        link to try again whenever you&apos;re ready.
      </p>
    </StatusShell>
  );
}
