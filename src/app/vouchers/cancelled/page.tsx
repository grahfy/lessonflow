import type { Metadata } from "next";

import { StatusShell } from "../../pay/_components/status-shell";

export const metadata: Metadata = {
  title: "Voucher purchase cancelled",
  robots: { index: false, follow: false },
};

/**
 * Landing page when the buyer cancels the gift-voucher Stripe Checkout. No
 * charge is made and the pending voucher simply remains unpaid.
 */
export default function VoucherCancelledPage() {
  return (
    <StatusShell title="Purchase cancelled">
      <p style={{ marginTop: 0 }}>
        Your gift voucher purchase was cancelled and you have not been charged.
        You can return to the vouchers page to try again whenever you&apos;re
        ready.
      </p>
      <p style={{ marginBottom: 0 }}>
        <a href="/vouchers" style={{ color: "#2247d8", fontWeight: 600 }}>
          Back to vouchers
        </a>
      </p>
    </StatusShell>
  );
}
