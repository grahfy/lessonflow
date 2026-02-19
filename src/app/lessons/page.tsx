import Link from "next/link";

import { PanelLayout } from "@/components/panel-layout";

export default function LessonsPage() {
  return (
    <PanelLayout
      kicker="Lesson Paths"
      title="Beginner to advanced, one clear progression."
      lead="Lessons are custom-built to your current level. You will work on technique, songs, rhythm, fretboard understanding, and confidence in real playing situations."
      visualLabel="Lesson"
      visualClassName="lessons-hero"
      footerCopy="Structured pathway with room for your own music style."
    >
      <div className="card-grid">
        <article className="info-card">
          <h3>Beginner</h3>
          <p>Foundations, posture, tuning, chords, rhythm basics, and your first complete songs.</p>
        </article>
        <article className="info-card">
          <h3>Intermediate</h3>
          <p>Scale fluency, phrasing, timing control, and cleaner transitions between rhythm and lead.</p>
        </article>
        <article className="info-card">
          <h3>Advanced</h3>
          <p>Speed control, improvisation systems, hybrid techniques, and performance-ready execution.</p>
        </article>
      </div>

      <div className="button-row">
        <Link className="btn btn-primary" href="/book">
          Start Lessons
        </Link>
        <Link className="btn btn-secondary" href="/vouchers">
          Gift a Package
        </Link>
      </div>
    </PanelLayout>
  );
}
