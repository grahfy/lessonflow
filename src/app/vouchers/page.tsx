import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Guitar Lesson Gift Vouchers | Melbourne Guitar School",
  path: "/vouchers",
  description:
    "Give a memorable gift with guitar lesson vouchers. Digital delivery, flexible booking, and suitable for beginners through experienced players."
});

export default function VouchersPage() {
  return (
    <PanelLayout
      kicker="Gift Guitar Lessons"
      title="Give a music gift that inspires creativity long after the day itself."
      lead="Melbourne Guitar School gift vouchers are ideal for beginners, returning players, and music lovers of any age. Delivered digitally and redeemed on a schedule that suits the recipient, they are a thoughtful gift that can spark confidence, creativity, and long-term progress."
      visualLabel="Gift voucher"
      visualClassName="vouchers-hero"
      leadJustified
    >
      <div className="card-grid" data-motion-item="vouchers-cards">
        <article className="info-card" data-motion-item="vouchers-how-card">
          <h3>How It Works</h3>
          <p>Choose a package, add recipient details, and send a polished digital voucher in minutes.</p>
        </article>
        <article className="info-card" data-motion-item="vouchers-who-card">
          <h3>Who It Suits</h3>
          <p>Kids, teens, and adults across all experience levels and musical tastes.</p>
        </article>
        <article className="info-card" data-motion-item="vouchers-flex-card">
          <h3>Flexible Start</h3>
          <p>The recipient books at a suitable time and learns at a pace that feels motivating, creative, and sustainable.</p>
        </article>
      </div>

      <p className="helper-text" data-motion-item="vouchers-helper-copy">
        Vouchers are a great option when you want to give something memorable, practical, and personal. They suit complete beginners as well as players who want fresh direction, better technique, or renewed creative momentum.
      </p>

      <div className="button-row" data-motion-item="vouchers-actions">
        <a
          className="btn btn-primary"
          href="https://giftup.app/place-order/903ac87a-4c81-4f66-6ec1-08de291b894b?platform=hosted"
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
