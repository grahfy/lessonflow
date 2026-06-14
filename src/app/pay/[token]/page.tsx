import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/invoices/currency";
import { isInvoicePayable } from "@/lib/invoices/payable";
import { isStripeConfigured } from "@/lib/stripe/client";
import { APP_TIMEZONE } from "@/lib/time";

import { StatusShell } from "../_components/status-shell";
import { PayNowButton } from "./pay-now-button";

/** Long-form date for the public pay page, consistent with the invoice PDF/email. */
function formatDueDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  }).format(date);
}

export const metadata: Metadata = {
  title: "Pay invoice",
  robots: { index: false, follow: false },
};

// The pay token is a bearer credential; never cache the rendered page.
export const dynamic = "force-dynamic";

type PayPageProps = {
  params: Promise<{ token: string }>;
};

/**
 * Public, tokenized pay page. GET is strictly side-effect-free: it only reads
 * the invoice by `payToken` and renders a summary. Creating the Stripe Checkout
 * session happens on POST (the "Pay now" form) so email link prefetching can
 * never open a session.
 */
export default async function PayPage({ params }: PayPageProps) {
  const { token } = await params;

  const invoice = token
    ? await prisma.invoice.findUnique({
        where: { payToken: token },
        select: {
          invoiceNumber: true,
          status: true,
          isDeleted: true,
          documentType: true,
          currency: true,
          totalCents: true,
          dueAt: true,
          sellerBusinessName: true,
          customerName: true,
        },
      })
    : null;

  // Payability uses the shared isInvoicePayable rule (sent, not deleted, real
  // invoice — not a credit note). Anything else (paid, void, draft, deleted,
  // unknown token) renders a friendly status page that leaks nothing beyond the
  // high-level state.
  const payable = isInvoicePayable(invoice);

  if (!invoice || invoice.isDeleted) {
    return (
      <StatusShell title="Invoice not found">
        <p>
          This payment link is no longer valid. If you believe this is an error,
          please contact us and we&apos;ll help you settle your invoice.
        </p>
      </StatusShell>
    );
  }

  if (invoice.status === "paid") {
    return (
      <StatusShell title="Already paid" business={invoice.sellerBusinessName}>
        <p>
          Invoice <strong>{invoice.invoiceNumber}</strong> has already been paid.
          Thank you!
        </p>
      </StatusShell>
    );
  }

  if (!payable) {
    return (
      <StatusShell title="Invoice unavailable" business={invoice.sellerBusinessName}>
        <p>
          Invoice <strong>{invoice.invoiceNumber}</strong> is not currently
          available for online payment. Please contact us if you have questions.
        </p>
      </StatusShell>
    );
  }

  if (!isStripeConfigured()) {
    return (
      <StatusShell title="Online payment unavailable" business={invoice.sellerBusinessName}>
        <p>
          Online payment is not currently available for invoice{" "}
          <strong>{invoice.invoiceNumber}</strong>. Please contact us to arrange
          payment.
        </p>
      </StatusShell>
    );
  }

  return (
    <StatusShell title="Pay your invoice" business={invoice.sellerBusinessName}>
      <p style={{ marginTop: 0 }}>
        Hi {invoice.customerName}, here are the details for invoice{" "}
        <strong>{invoice.invoiceNumber}</strong>.
      </p>
      <div
        style={{
          padding: "1rem 0",
          borderTop: "1px solid #e5e7eb",
          borderBottom: "1px solid #e5e7eb",
          margin: "1.25rem 0",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span style={{ color: "#6b7280" }}>Amount due</span>
          <span style={{ fontSize: "1.75rem", fontWeight: 700 }}>
            {formatCurrency(invoice.totalCents, invoice.currency)}
          </span>
        </div>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#6b7280" }}>
          Due {formatDueDate(invoice.dueAt)}
        </p>
      </div>
      <PayNowButton token={token} />
      <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "1rem" }}>
        Payments are processed securely by Stripe.
      </p>
    </StatusShell>
  );
}
