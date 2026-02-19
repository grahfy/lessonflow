import Link from "next/link";

import { PanelLayout } from "@/components/panel-layout";

export default function HomePage() {
  return (
    <PanelLayout
      kicker="Northcote, Melbourne"
      title="Learn guitar with a modern, personal approach."
      lead="Melbourne Guitar School is built around your goals, your music taste, and your pace. From first chords to advanced lead work, every lesson is tailored so you keep moving forward."
      visualLabel="Guitar performance"
      visualClassName="home-hero"
      footerCopy="Arrow keys or swipe to move between pages."
      actions={
        <div className="button-row">
          <Link className="btn btn-primary" href="/book">
            Book Intro Lesson
          </Link>
          <Link className="btn btn-secondary" href="/lessons">
            View Lesson Paths
          </Link>
        </div>
      }
    >
      <div className="metrics">
        <div className="metric">
          <strong>30+</strong>
          <span>Years Playing</span>
        </div>
        <div className="metric">
          <strong>All Levels</strong>
          <span>Beginner to Advanced</span>
        </div>
        <div className="metric">
          <strong>Northcote</strong>
          <span>In Person + Online</span>
        </div>
      </div>
    </PanelLayout>
  );
}
