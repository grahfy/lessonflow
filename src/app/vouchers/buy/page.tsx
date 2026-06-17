import type { Metadata } from "next";

import { PanelLayout } from "@/components/panel-layout";
import { getBranding, getDefaultCurrency, getSubjectLabel } from "@/lib/branding";
import { isStripeConfigured } from "@/lib/stripe/client";
import { buildPublicPageMetadata } from "@/lib/seo";
import { VOUCHER_DENOMINATIONS_CENTS } from "@/lib/vouchers/purchase";

import { VoucherBuyForm } from "./voucher-buy-form";

export function generateMetadata(): Metadata {
  const branding = getBranding();
  const subjectLabel = getSubjectLabel(branding.PRIMARY_SUBJECT);

  return buildPublicPageMetadata({
    title: `Buy a ${subjectLabel} Lesson Gift Voucher | ${branding.PUBLIC_BRAND_NAME}`,
    path: "/vouchers/buy",
    description: `Purchase a digital ${subjectLabel.toLowerCase()} lesson gift voucher. Choose an amount, add recipient details, and pay securely online.`,
  });
}

/**
 * Public gift-voucher purchase page. Renders the denomination + recipient form
 * which posts to the hardened public buy endpoint. When Stripe is not
 * configured the page degrades to an informational message instead of a broken
 * form, mirroring the public pay page behaviour.
 */
export default function VoucherBuyPage() {
  const branding = getBranding();
  const subjectLabel = getSubjectLabel(branding.PRIMARY_SUBJECT);
  const currency = getDefaultCurrency();
  const stripeReady = isStripeConfigured();

  return (
    <PanelLayout
      kicker={`Gift ${subjectLabel} Lessons`}
      title="Buy a gift voucher"
      lead="Choose an amount and add the recipient's details. We'll email the voucher code to them once your payment is complete. Vouchers are valid for six months and can be redeemed for account credit toward lessons."
      visualLabel="Gift voucher"
      visualClassName="vouchers-hero"
      leadJustified
    >
      {stripeReady ? (
        <VoucherBuyForm
          denominations={[...VOUCHER_DENOMINATIONS_CENTS]}
          currency={currency}
        />
      ) : (
        <p className="helper-text">
          Online voucher purchase is temporarily unavailable. Please get in touch
          and we&apos;ll arrange a gift voucher for you.
        </p>
      )}
    </PanelLayout>
  );
}
