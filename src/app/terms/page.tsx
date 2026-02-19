import Link from "next/link";

import { PanelLayout } from "@/components/panel-layout";

export default function TermsPage() {
  return (
    <PanelLayout
      kicker="Policies"
      title="Simple terms for smooth weekly progress."
      lead="These summaries reflect the current policy structure. Final wording should always be confirmed before launch."
      visualLabel="Acoustic guitar"
      visualClassName="terms-hero"
      footerCopy="Policy clarity keeps lessons predictable for everyone."
      leadJustified
    >
      <ul className="list">
        <li>24 hours notice is required for lesson changes where possible.</li>
        <li>No refund policy once lesson payments are completed.</li>
        <li>Gift vouchers are non-refundable and follow standard cancellation rules.</li>
        <li>Gift vouchers are valid for six months from purchase date.</li>
      </ul>

      <div className="button-row">
        <Link className="btn btn-primary" href="/contact">
          Ask a Question
        </Link>
        <Link className="btn btn-secondary" href="/">
          Back to Home
        </Link>
      </div>
    </PanelLayout>
  );
}
