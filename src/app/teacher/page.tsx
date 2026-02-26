import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Meet Jon King | Guitar Teacher, Musician & Mentor",
  path: "/teacher",
  description:
    "Train with Jon King, a working guitarist, songwriter, and mentor with 30+ years playing, live performance experience, and a strong focus on practical progress."
});

export default function TeacherPage() {
  return (
    <PanelLayout
      kicker="Your Teacher"
      title="Work with Jon King, a guitarist and mentor who teaches from lived musical experience."
      lead="Jon King brings over 30 years of guitar experience, a music production background, and a long teaching history helping students of different ages and levels make meaningful progress. His approach is practical, creative, and personalised, with a strong focus on helping you sound better in real playing situations, not just isolated exercises."
      visualLabel="Teacher playing guitar"
      visualClassName="teacher-hero"
      leadJustified
    >
      <p className="helper-text" data-motion-item="teacher-helper-text">
        Jon’s teaching style balances technique, creativity, and confidence-building. Whether you want to learn songs, improve your tone, develop lead playing, write stronger parts, or build deeper fundamentals, lessons are shaped around your goals and the way you learn best.
      </p>
      <ul className="list" data-motion-item="teacher-highlights">
        <li data-motion-item="teacher-highlight-endorsement">
          Endorsement history with Ernie Ball Musicman Guitars Australia.
        </li>
        <li data-motion-item="teacher-highlight-touring">
          Touring experience across Europe and live performance with major acts.
        </li>
        <li data-motion-item="teacher-highlight-focus">
          Coaching focused on practical results, musical confidence, and long-term technique.
        </li>
        <li data-motion-item="teacher-highlight-identity">
          Teaching and mentoring across beginners, returning players, and advanced guitarists.
        </li>
        <li data-motion-item="teacher-highlight-creative">
          Lessons designed to strengthen both technical control and creative identity.
        </li>
      </ul>

      <p className="helper-text" data-motion-item="teacher-work-links">
        Explore Jon King&apos;s work:{" "}
        <a href="https://www.chantelleandjon.com/" target="_blank" rel="noopener noreferrer">
          chantelleandjon.com
        </a>
        {" · "}
        <a href="https://www.facebook.com/damnationsdayband" target="_blank" rel="noopener noreferrer">
          Damnations Day on Facebook
        </a>
      </p>

      <div className="button-row" data-motion-item="teacher-actions">
        <TweenLink className="btn btn-primary" href="/book" data-motion-item="teacher-action-book">
          Book a Lesson with Jon King
        </TweenLink>
        <TweenLink className="btn btn-secondary" href="/lessons" data-motion-item="teacher-action-lessons">
          Explore Lesson Paths
        </TweenLink>
      </div>
    </PanelLayout>
  );
}
