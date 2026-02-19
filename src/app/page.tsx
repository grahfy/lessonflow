import { TweenLink } from "@/components/motion/tween-link";
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
        <div className="button-row" data-motion-item="home-actions">
          <TweenLink className="btn btn-primary" href="/book" data-motion-item="home-action-book">
            Book Intro Lesson
          </TweenLink>
          <TweenLink className="btn btn-secondary" href="/lessons" data-motion-item="home-action-lessons">
            View Lesson Paths
          </TweenLink>
        </div>
      }
    >
      <div className="metrics" data-motion-item="home-metrics">
        <div className="metric" data-motion-item="home-metric-experience">
          <strong>30+</strong>
          <span>Years Playing</span>
        </div>
        <div className="metric" data-motion-item="home-metric-levels">
          <strong>All Levels</strong>
          <span>Beginner to Advanced</span>
        </div>
        <div className="metric" data-motion-item="home-metric-location">
          <strong>Northcote</strong>
          <span>In Person + Online</span>
        </div>
      </div>
    </PanelLayout>
  );
}
