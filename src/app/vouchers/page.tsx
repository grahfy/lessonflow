import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";

import { getContent } from "@/lib/cms";
import { 
  PUBLIC_BRAND_NAME, 
  getSubjectLabel
} from "@/lib/branding";

export const metadata: Metadata = buildPublicPageMetadata({
  title: `${getSubjectLabel()} Lesson Gift Vouchers | ${PUBLIC_BRAND_NAME}`,
  path: "/vouchers",
  description:
    `Give a memorable gift with ${getSubjectLabel().toLowerCase()} lesson vouchers. Digital delivery, flexible booking, and suitable for beginners through experienced players.`
});

export default async function VouchersPage() {
  const heroContent = await getContent("/vouchers", "hero", {
    kicker: `Gift ${getSubjectLabel()} Lessons`,
    title: "Give a music gift that inspires creativity long after the day itself.",
    lead: `${PUBLIC_BRAND_NAME} gift vouchers are ideal for beginners, returning players, and music lovers of any age. Delivered digitally and redeemed on a schedule that suits the recipient, they are a thoughtful gift that can spark confidence, creativity, and long-term progress.`,
    visualLabel: "Gift voucher",
    visualClassName: "vouchers-hero"
  });

  const bodyContent = await getContent("/vouchers", "body", {
    card1Title: "How It Works",
    card1Body: "Choose a package, add recipient details, and send a polished digital voucher in minutes.",
    card2Title: "Who It Suits",
    card2Body: "Kids, teens, and adults across all experience levels and musical tastes.",
    card3Title: "Flexible Start",
    card3Body: "The recipient books at a suitable time and learns at a pace that feels motivating, creative, and sustainable.",
    helperText: "Vouchers are a great option when you want to give something memorable, practical, and personal. They suit complete beginners as well as players who want fresh direction, better technique, or renewed creative momentum.",
    orderUrl: "https://giftup.app/place-order/903ac87a-4c81-4f66-6ec1-08de291b894b?platform=hosted"
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
      <div className="card-grid" data-motion-item="vouchers-cards">
        <article className="info-card" data-motion-item="vouchers-how-card">
          <h3>{bodyContent.card1Title}</h3>
          <p>{bodyContent.card1Body}</p>
        </article>
        <article className="info-card" data-motion-item="vouchers-who-card">
          <h3>{bodyContent.card2Title}</h3>
          <p>{bodyContent.card2Body}</p>
        </article>
        <article className="info-card" data-motion-item="vouchers-flex-card">
          <h3>{bodyContent.card3Title}</h3>
          <p>{bodyContent.card3Body}</p>
        </article>
      </div>

      <p className="helper-text copy-justify" data-motion-item="vouchers-helper-copy">
        {bodyContent.helperText}
      </p>

      <div className="button-row button-row-justify" data-motion-item="vouchers-actions">
        <a
          className="btn btn-primary"
          href={bodyContent.orderUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-motion-item="vouchers-action-order"
        >
          Buy a Voucher
        </a>
        <TweenLink className="btn btn-secondary" href="/terms" data-motion-item="vouchers-action-terms">
          Voucher Terms
        </TweenLink>
      </div>
    </PanelLayout>
  );
}
