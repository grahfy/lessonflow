import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Guitar Lessons - Beginner to Advanced",
  path: "/lessons",
  description:
    "Custom guitar lessons for all levels. Build technique, learn songs, develop rhythm and fretboard understanding with personalised lesson paths."
});

export default function LessonsPage() {
  return (
    <PanelLayout
      kicker="Lesson Paths"
      title="Beginner to advanced, one clear progression."
      lead="Lessons are custom-built to your current level. You will work on technique, songs, rhythm, fretboard understanding, and confidence in real playing situations."
      visualLabel="Lesson"
      visualClassName="lessons-hero"
    >
      <div className="card-grid" data-motion-item="lessons-cards">
        <article className="info-card" data-motion-item="lessons-beginner-card">
          <h3>Beginner</h3>
          <p>Foundations, posture, tuning, chords, rhythm basics, and your first complete songs.</p>
        </article>
        <article className="info-card" data-motion-item="lessons-intermediate-card">
          <h3>Intermediate</h3>
          <p>Scale fluency, phrasing, timing control, and cleaner transitions between rhythm and lead.</p>
        </article>
        <article className="info-card" data-motion-item="lessons-advanced-card">
          <h3>Advanced</h3>
          <p>Speed control, improvisation systems, hybrid techniques, and performance-ready execution.</p>
        </article>
      </div>

      <div className="button-row" data-motion-item="lessons-actions">
        <TweenLink className="btn btn-primary" href="/book" data-motion-item="lessons-action-start">
          Start Lessons
        </TweenLink>
        <TweenLink className="btn btn-secondary" href="/vouchers" data-motion-item="lessons-action-voucher">
          Gift a Package
        </TweenLink>
      </div>
    </PanelLayout>
  );
}
