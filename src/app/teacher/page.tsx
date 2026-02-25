import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Your Teacher - Jon",
  path: "/teacher",
  description:
    "Learn guitar with Jon, an experienced guitarist with 30+ years playing, music production background, and endorsements from Ernie Ball Musicman Guitars Australia."
});

export default function TeacherPage() {
  return (
    <PanelLayout
      kicker="Your Teacher"
      title="Learn with Jon, an experienced guitarist and mentor."
      lead="Jon has over 30 years of guitar experience, a music production background, and a long teaching history with students of different ages and levels."
      visualLabel="Teacher playing guitar"
      visualClassName="teacher-hero"
      leadJustified
    >
      <ul className="list" data-motion-item="teacher-highlights">
        <li data-motion-item="teacher-highlight-endorsement">
          Local endorsement history with Ernie Ball Musicman Guitars Australia.
        </li>
        <li data-motion-item="teacher-highlight-touring">
          Touring experience across Europe and live performance with major acts.
        </li>
        <li data-motion-item="teacher-highlight-focus">
          Focus on practical progress, musical confidence, and long-term technique.
        </li>
      </ul>

      <div className="button-row" data-motion-item="teacher-actions">
        <TweenLink className="btn btn-primary" href="/book" data-motion-item="teacher-action-book">
          Work With Jon
        </TweenLink>
        <TweenLink className="btn btn-secondary" href="/lessons" data-motion-item="teacher-action-lessons">
          See Learning Paths
        </TweenLink>
      </div>
    </PanelLayout>
  );
}
