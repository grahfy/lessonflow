import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";

export default function TermsPage() {
  return (
    <PanelLayout
      kicker="Policies"
      title="Simple terms for smooth weekly progress."
      lead="These summaries reflect the current policy structure. Final wording should always be confirmed before launch."
      visualLabel="Acoustic guitar"
      visualClassName="terms-hero"
      leadJustified
    >
      <ul className="list" data-motion-item="terms-list">
        <li data-motion-item="terms-item-notice">24 hours notice is required for lesson changes where possible.</li>
        <li data-motion-item="terms-item-refund">No refund policy once lesson payments are completed.</li>
        <li data-motion-item="terms-item-voucher-rules">
          Gift vouchers are non-refundable and follow standard cancellation rules.
        </li>
        <li data-motion-item="terms-item-validity">Gift vouchers are valid for six months from purchase date.</li>
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
