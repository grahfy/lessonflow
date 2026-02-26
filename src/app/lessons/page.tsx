import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Guitar Lesson Paths | Creative Coaching for Every Level",
  path: "/lessons",
  description:
    "Structured, creative guitar coaching for beginners through advanced players. Learn songs faster, sharpen technique, and develop a more confident sound."
});

export default function LessonsPage() {
  return (
    <PanelLayout
      kicker="Lesson Paths"
      title="A lesson path that meets you where you are and grows with your sound."
      lead="Every program is tailored to your level, goals, and musical taste. We build technique, timing, fretboard fluency, and performance confidence through practical playing instead of disconnected exercises. The result is a lesson experience that feels creative, focused, and directly tied to the music you want to make."
      viewClassName="view-lessons-page"
      visualLabel="Lesson"
      visualClassName="lessons-hero"
    >
      <p className="helper-text" data-motion-item="lessons-helper-text">
        Lessons can include song learning, rhythm guitar, lead guitar, improvisation, technique development, ear training, tone guidance, and smart practice planning. The focus is steady progress and musical confidence, not just collecting theory or random tips.
      </p>
      <div className="card-grid" data-motion-item="lessons-cards">
        <article className="info-card" data-motion-item="lessons-beginner-card">
          <h3>Beginner</h3>
          <p>Start strong with posture, tuning, chord changes, rhythm fundamentals, and songs you actually want to play. Build a foundation that makes practice feel clear, creative, and productive from day one.</p>
        </article>
        <article className="info-card" data-motion-item="lessons-intermediate-card">
          <h3>Intermediate</h3>
          <p>Build cleaner technique, stronger timing, better phrasing, and confident movement between rhythm and lead. Develop consistency so your playing sounds tighter, more musical, and more intentional.</p>
        </article>
        <article className="info-card" data-motion-item="lessons-advanced-card">
          <h3>Advanced</h3>
          <p>Refine speed, improvisation, articulation, and advanced techniques for polished, performance-ready playing. Dial in the details that turn strong players into distinctive players.</p>
        </article>
      </div>

      <section className="lesson-pricing-card" data-motion-item="lessons-pricing" aria-label="Lesson pricing">
        <h3>Guitar Lesson Prices</h3>
        <div className="lesson-pricing-grid">
          <div>
            <h4>30 minute Guitar lessons</h4>
            <p>5 lessons - $200 ($40 each)</p>
            <p>10 lessons - $388 ($38.80 each)</p>
          </div>
          <div>
            <h4>1 Hour Guitar lessons</h4>
            <p>5 lessons - $375 ($75 each)</p>
            <p>10 lessons - $725 ($72.50 each)</p>
          </div>
        </div>
        <p className="lesson-pricing-note">Gift vouchers are available.</p>
      </section>

      <div className="button-row" data-motion-item="lessons-actions">
        <TweenLink className="btn btn-primary" href="/book" data-motion-item="lessons-action-start">
          Book Your First Lesson
        </TweenLink>
        <TweenLink className="btn btn-secondary" href="/vouchers" data-motion-item="lessons-action-voucher">
          Buy a Gift Voucher
        </TweenLink>
      </div>
    </PanelLayout>
  );
}
