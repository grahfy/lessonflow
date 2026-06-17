import type { Metadata } from "next";

import { StatusShell } from "../../pay/_components/status-shell";

export const metadata: Metadata = {
  title: "Voucher purchased",
  robots: { index: false, follow: false },
};

/**
 * Landing page after a successful gift-voucher Stripe Checkout. Purely
 * informational; the authoritative voucher activation + code email are sent by
 * the webhook once payment clears, not by this redirect.
 */
export default function VoucherSuccessPage() {
  return (
    <StatusShell title="Thank you for your purchase">
      <p style={{ marginTop: 0 }}>
        Your gift voucher payment was successful. The voucher code will be emailed
        to the recipient shortly, and a payment receipt will be sent to you by
        Stripe.
      </p>
    </StatusShell>
  );
}
