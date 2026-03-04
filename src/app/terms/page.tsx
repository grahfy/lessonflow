import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";

import { PUBLIC_BRAND_NAME } from "@/lib/branding";
import { getContent } from "@/lib/cms";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Lesson Terms, Cancellations & Voucher Policies",
  path: "/terms",
  description:
    `Read ${PUBLIC_BRAND_NAME} policies for cancellations, make-up lessons, payments, and gift vouchers before booking.`
});

export default async function TermsPage() {
  const heroContent = await getContent("/terms", "hero", {
    kicker: "Policies",
    title: "Simple, fair policies that keep lessons running smoothly.",
    lead: "These policies are designed to protect lesson momentum, keep scheduling clear, and set reliable expectations for students and families. Clear terms help every student get the most value from their lesson time and keep progress moving.",
    visualLabel: "Terms photo",
    visualClassName: "terms-hero"
  });

  const bodyContent = await getContent("/terms", "body", {
    terms: [
      "If less than 24 hours notice is given for a cancellation or change, the full lesson fee is still payable.",
      "If more than 24 hours notice is given, a make-up lesson will be provided within the same week.",
      "Lesson payments are non-refundable once payment has been made.",
      "Gift vouchers are non-refundable and are subject to the same cancellation and make-up lesson rules.",
      "Gift vouchers are valid for six months from the purchase date."
    ]
  });

  return (
    <PanelLayout
      kicker={heroContent.kicker}
      title={heroContent.title}
      lead={heroContent.lead}
      visualLabel={heroContent.visualLabel}
      visualClassName={heroContent.visualClassName}
      leadJustified
    >
      <ul className="list" data-motion-item="terms-list">
        {bodyContent.terms.map((term: string, index: number) => (
          <li key={index} data-motion-item={`terms-item-${index}`}>
            {term}
          </li>
        ))}
      </ul>

      <div className="button-row button-row-justify" data-motion-item="terms-actions">
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
