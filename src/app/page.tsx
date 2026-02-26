import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Creative Guitar Lessons in Northcote | Melbourne Guitar School",
  path: "/",
  description:
    "Artist-minded one-on-one guitar lessons in Northcote tailored to your sound, goals, and pace. Build technique, confidence, and musical identity with modern coaching."
});

export default function HomePage() {
  return (
    <PanelLayout
      kicker="Northcote, Melbourne"
      title="Build your sound. Refine your voice. Play with more intention."
      lead="Melbourne Guitar School offers artist-minded one-on-one coaching and guitar tuition shaped around your musical identity, goals, and pace. Whether you are starting from scratch, returning to the instrument, or chasing a sharper and more expressive sound, each lesson is built to create progress you can hear in real music, not just practice-room exercises."
      visualLabel="Guitar performance"
      visualClassName="home-hero"
      leadJustified={true}
      actions={
        <div className="home-actions" data-motion-item="home-actions">
          <div className="home-actions-primary" data-motion-item="home-action-book">
            <TweenLink className="btn btn-primary" href="/book">
              Start With a First Guitar Tuition Session
            </TweenLink>
          </div>
          <div className="home-actions-secondary">
            <TweenLink className="btn btn-secondary" href="/videos" data-motion-item="home-action-videos">
              Watch Jon King
            </TweenLink>
            <TweenLink className="btn btn-secondary" href="/lessons" data-motion-item="home-action-lessons">
              Explore Lesson Paths
            </TweenLink>
          </div>
        </div>
      }
    >
      <div className="metrics" data-motion-item="home-metrics">
        <div className="metric" data-motion-item="home-metric-experience">
          <strong>30+</strong>
          <span>Years of Playing + Teaching</span>
        </div>
        <div className="metric" data-motion-item="home-metric-levels">
          <strong>All Levels</strong>
          <span>Beginners to Advanced</span>
        </div>
        <div className="metric" data-motion-item="home-metric-location">
          <strong>Northcote</strong>
          <span>Studio + Online Sessions</span>
        </div>
      </div>
      <p className="helper-text" data-motion-item="home-copy-note">
        Guitar tuition focuses on practical musicianship: cleaner technique, stronger rhythm, better fretboard awareness, and the confidence to play with control, feel, and expression. You will work on music you genuinely connect with, while building the technical foundation and creative instinct that make your playing recognisable as your own.
      </p>
    </PanelLayout>
  );
}
