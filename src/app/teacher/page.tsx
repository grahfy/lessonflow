import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";

import { getContent } from "@/lib/cms";
import { getSubjectLabel } from "@/lib/branding";

export const metadata: Metadata = buildPublicPageMetadata({
  title: `Meet Your ${getSubjectLabel()} Teacher | Musician & Mentor`,
  path: "/teacher",
  description:
    `Train with an experienced ${getSubjectLabel().toLowerCase()} teacher, musician, and mentor with a focus on practical progress and creative growth.`
});

export default async function TeacherPage() {
  const heroContent = await getContent("/teacher", "hero", {
    kicker: "Your Teacher",
    title: `Work with a ${getSubjectLabel().toLowerCase()} mentor who teaches from lived musical experience.`,
    lead: `Our teaching approach brings together years of professional experience, a music production background, and a long history helping students of different ages and levels make meaningful progress. The focus is practical, creative, and personalised, helping you sound better in real playing situations, not just isolated exercises.`,
    visualLabel: `Teacher playing ${getSubjectLabel().toLowerCase()}`,
    visualClassName: "teacher-hero"
  });

  const bodyContent = await getContent("/teacher", "body", {
    helperText: `The teaching style balances technique, creativity, and confidence-building. Whether you want to learn songs, improve your tone, develop lead playing, write stronger parts, or build deeper fundamentals, lessons are shaped around your goals and the way you learn best.`,
    highlights: [
      "Extensive professional performance and recording history.",
      "Coaching focused on practical results, musical confidence, and long-term technique.",
      "Teaching and mentoring across beginners, returning players, and advanced students.",
      "Lessons designed to strengthen both technical control and creative identity."
    ],
    workLinkText: "Explore our work",
    workLinks: [
      { label: "chantelleandjon.com", href: "https://www.chantelleandjon.com/" }
    ]
  });

  return (
    <PanelLayout
      kicker={heroContent.kicker}
      title={heroContent.title}
      lead={heroContent.lead}
      visualLabel={heroContent.visualLabel}
      visualClassName={heroContent.visualClassName}
      leadJustified
    >
      <p className="helper-text copy-justify" data-motion-item="teacher-helper-text">
        {bodyContent.helperText}
      </p>
      <ul className="list" data-motion-item="teacher-highlights">
        {bodyContent.highlights.map((highlight: string, index: number) => (
          <li key={index} data-motion-item={`teacher-highlight-${index}`}>
            {highlight}
          </li>
        ))}
      </ul>

      {bodyContent.workLinks.length > 0 && (
        <p className="helper-text" data-motion-item="teacher-work-links">
          {bodyContent.workLinkText}:{" "}
          {bodyContent.workLinks.map((link: { label: string, href: string }, index: number) => (
            <span key={index}>
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
              {index < bodyContent.workLinks.length - 1 ? " · " : ""}
            </span>
          ))}
        </p>
      )}

      <div className="button-row" data-motion-item="teacher-actions">
        <TweenLink className="btn btn-primary" href="/book" data-motion-item="teacher-action-book">
          Book a Lesson Today
        </TweenLink>
        <TweenLink className="btn btn-secondary" href="/lessons" data-motion-item="teacher-action-lessons">
          Explore Lesson Paths
        </TweenLink>
      </div>
    </PanelLayout>
  );
}
