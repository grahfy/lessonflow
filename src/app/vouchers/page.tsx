import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";

export default function VouchersPage() {
  return (
    <PanelLayout
      kicker="Gift Guitar Lessons"
      title="Give a practical gift that lasts for years."
      lead="Gift vouchers are ideal for beginners and returning players. Packages are delivered digitally and can be redeemed for lessons that fit the student schedule."
      visualLabel="Gift voucher"
      visualClassName="vouchers-hero"
      footerCopy="Digital delivery with simple booking follow-up."
      leadJustified
    >
      <div className="card-grid">
        <article className="info-card">
          <h3>How It Works</h3>
          <p>Choose a package, add recipient details, and send a digital voucher in minutes.</p>
        </article>
        <article className="info-card">
          <h3>Who It Suits</h3>
          <p>Kids, teens, and adults with any level of experience or style preference.</p>
        </article>
        <article className="info-card">
          <h3>Flexible Start</h3>
          <p>The recipient books sessions at a suitable time and progresses at their pace.</p>
        </article>
      </div>

      <div className="button-row">
        <TweenLink className="btn btn-primary" href="/book">
          Order a Voucher
        </TweenLink>
        <TweenLink className="btn btn-secondary" href="/terms">
          Voucher Terms
        </TweenLink>
      </div>
    </PanelLayout>
  );
}
