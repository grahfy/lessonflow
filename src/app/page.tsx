import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";
import { getContent } from "@/lib/cms";
import { getBranding, getSubjectLabel } from "@/lib/branding";

export function generateMetadata(): Metadata {
  const branding = getBranding();
  const subjectLabel = getSubjectLabel(branding.PRIMARY_SUBJECT);

  return buildPublicPageMetadata({
    title: `${branding.PUBLIC_BRAND_NAME}: Creative ${subjectLabel} Lessons in ${branding.PRIMARY_LOCATION}`,
    path: "/",
    description:
      `Artist-minded one-on-one ${branding.PRIMARY_SUBJECT.toLowerCase()} lessons in ${branding.PRIMARY_LOCATION} tailored to your sound, goals, and pace. Build technique, confidence, and musical identity with modern coaching.`
  });
}

export default async function HomePage() {
  const branding = getBranding();
  const subjectLabel = getSubjectLabel(branding.PRIMARY_SUBJECT);
  const heroContent = await getContent("/", "hero", {
    kicker: `${branding.PRIMARY_LOCATION.toUpperCase()}, MELBOURNE`,
    title: "Build your sound. Refine your voice. Play with more intention.",
    lead: `${branding.PUBLIC_BRAND_NAME} offers artist-minded one-on-one coaching and ${branding.PRIMARY_SUBJECT.toLowerCase()} tuition shaped around your musical identity, goals, and pace. Whether you are starting from scratch, returning to the instrument, or chasing a sharper and more expressive sound, each lesson is built to create progress you can hear in real music, not just practice-room exercises.`,
    visualClassName: "home-hero",
    visualLabel: `${subjectLabel} performance`
  });

  const metricsContent = await getContent("/", "metrics", {
    experienceValue: "30+",
    experienceLabel: "YEARS OF PLAYING + TEACHING",
    levelsValue: "All Levels",
    levelsLabel: "BEGINNERS TO ADVANCED",
    locationValue: branding.PRIMARY_LOCATION,
    locationLabel: "STUDIO + ONLINE SESSIONS"
  });

  const bodyContent = await getContent("/", "body", {
    note: `${subjectLabel} tuition focuses on practical musicianship: cleaner technique, stronger rhythm, better fretboard awareness, and the confidence to play with control, feel, and expression. You will work on music you genuinely connect with, while building the technical foundation and creative instinct that make your playing recognisable as your own.`
  });

  return (
    <PanelLayout
      kicker={heroContent.kicker}
      title={heroContent.title}
      lead={heroContent.lead}
      visualLabel={heroContent.visualLabel}
      visualClassName={heroContent.visualClassName}
      leadJustified={true}
      actions={
        <>
          <div className="home-actions home-actions-justified" data-motion-item="home-actions">
            <TweenLink className="btn btn-primary" href="/book" data-motion-item="home-action-book">
              Book Your {subjectLabel} Lesson Today
            </TweenLink>
            <TweenLink className="btn btn-secondary" href="/videos" data-motion-item="home-action-videos">
              Watch Videos
            </TweenLink>
            <TweenLink className="btn btn-secondary" href="/lessons" data-motion-item="home-action-lessons">
              Explore Lesson Paths
            </TweenLink>
          </div>
          <p className="helper-text home-legal-links" data-motion-item="home-legal-links">
            <TweenLink href="/privacy">Privacy Policy</TweenLink>
            <span aria-hidden="true">•</span>
            <TweenLink href="/terms-of-service">Terms of Service</TweenLink>
          </p>
        </>
      }
    >
      <div className="metrics" data-motion-item="home-metrics">
        <div className="metric" data-motion-item="home-metric-experience">
          <strong>{metricsContent.experienceValue}</strong>
          <span>{metricsContent.experienceLabel}</span>
        </div>
        <div className="metric" data-motion-item="home-metric-levels">
          <strong>{metricsContent.levelsValue}</strong>
          <span>{metricsContent.levelsLabel}</span>
        </div>
        <div className="metric" data-motion-item="home-metric-location">
          <strong>{metricsContent.locationValue}</strong>
          <span>{metricsContent.locationLabel}</span>
        </div>
      </div>
      <p className="helper-text copy-justify" data-motion-item="home-copy-note">
        {bodyContent.note}
      </p>
    </PanelLayout>
  );
}
