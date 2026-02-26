import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Lesson Terms, Cancellations & Voucher Policies",
  path: "/terms",
  description:
    "Read Melbourne Guitar School policies for cancellations, make-up lessons, payments, and gift vouchers before booking."
});

export default function TermsPage() {
  return (
    <PanelLayout
      kicker="Policies"
      title="Simple, fair policies that keep lessons running smoothly."
      lead="These policies are designed to protect lesson momentum, keep scheduling clear, and set reliable expectations for students and families. Clear terms help every student get the most value from their lesson time and keep progress moving."
      visualLabel="Terms photo"
      visualClassName="terms-hero"
      leadJustified
    >
      <ul className="list" data-motion-item="terms-list">
        <li data-motion-item="terms-item-notice">
          If less than 24 hours notice is given for a cancellation or change, the full lesson fee is still payable.
        </li>
        <li data-motion-item="terms-item-makeup">
          If more than 24 hours notice is given, a make-up lesson will be provided within the same week.
        </li>
        <li data-motion-item="terms-item-refund">Lesson payments are non-refundable once payment has been made.</li>
        <li data-motion-item="terms-item-voucher-rules">
          Gift vouchers are non-refundable and are subject to the same cancellation and make-up lesson rules.
        </li>
        <li data-motion-item="terms-item-validity">Gift vouchers are valid for six months from the purchase date.</li>
      </ul>

      <div className="button-row" data-motion-item="terms-actions">
        <TweenLink className="btn btn-primary" href="/contact" data-motion-item="terms-action-contact">
          Ask a Question
        </TweenLink>
        <TweenLink className="btn btn-secondary" href="/" data-motion-item="terms-action-home">
          Back to Home
        </TweenLink>
      </div>
    </PanelLayout>
  );
}
