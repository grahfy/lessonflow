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
    title: `${subjectLabel} Lesson Paths | Creative Coaching for Every Level`,
    path: "/lessons",
    description:
      `Structured, creative ${subjectLabel.toLowerCase()} coaching for beginners through advanced players. Learn songs faster, sharpen technique, and develop a more confident sound.`
  });
}

export default async function LessonsPage() {
  const branding = getBranding();
  const subjectLabel = getSubjectLabel(branding.PRIMARY_SUBJECT);

  const heroContent = await getContent("/lessons", "hero", {
    kicker: "Lesson Paths",
    title: "A lesson path that meets you where you are and grows with your sound.",
    lead: "Every program is tailored to your level, goals, and musical taste. We build technique, timing, fretboard fluency, and performance confidence through practical playing instead of disconnected exercises. The result is a lesson experience that feels creative, focused, and directly tied to the music you want to make.",
    visualLabel: "Lesson",
    visualClassName: "lessons-hero"
  });

  const bodyContent = await getContent("/lessons", "body", {
    helperText: `Lessons can include song learning, rhythm ${subjectLabel.toLowerCase()}, lead ${subjectLabel.toLowerCase()}, improvisation, technique development, ear training, tone guidance, and smart practice planning. The focus is steady progress and musical confidence, not just collecting theory or random tips.`,
    beginnerTitle: "Beginner",
    beginnerBody: "Start strong with posture, tuning, chord changes, rhythm fundamentals, and songs you actually want to play. Build a foundation that makes practice feel clear, creative, and productive from day one.",
    intermediateTitle: "Intermediate",
    intermediateBody: "Build cleaner technique, stronger timing, better phrasing, and confident movement between rhythm and lead. Develop consistency so your playing sounds tighter, more musical, and more intentional.",
    advancedTitle: "Advanced",
    advancedBody: "Refine speed, improvisation, articulation, and advanced techniques for polished, performance-ready playing. Dial in the details that turn strong players into distinctive players."
  });

  const pricingContent = await getContent("/lessons", "pricing", {
    title: `${subjectLabel} Lesson Prices`,
    min30Label: `30 minute ${subjectLabel} lessons`,
    min30Option1: "5 lessons - $200 ($40 each)",
    min30Option2: "10 lessons - $388 ($38.80 each)",
    min60Label: `1 Hour ${subjectLabel} lessons`,
    min60Option1: "5 lessons - $375 ($75 each)",
    min60Option2: "10 lessons - $725 ($72.50 each)",
    note: "Gift vouchers are available."
  });

  return (
    <PanelLayout
      kicker={heroContent.kicker}
      title={heroContent.title}
      lead={heroContent.lead}
      viewClassName="view-lessons-page"
      visualLabel={heroContent.visualLabel}
      visualClassName={heroContent.visualClassName}
      leadJustified={true}
    >
      <p className="helper-text copy-justify" data-motion-item="lessons-helper-text">
        {bodyContent.helperText}
      </p>
      <div className="card-grid" data-motion-item="lessons-cards">
        <article className="info-card" data-motion-item="lessons-beginner-card">
          <h3>{bodyContent.beginnerTitle}</h3>
          <p>{bodyContent.beginnerBody}</p>
        </article>
        <article className="info-card" data-motion-item="lessons-intermediate-card">
          <h3>{bodyContent.intermediateTitle}</h3>
          <p>{bodyContent.intermediateBody}</p>
        </article>
        <article className="info-card" data-motion-item="lessons-advanced-card">
          <h3>{bodyContent.advancedTitle}</h3>
          <p>{bodyContent.advancedBody}</p>
        </article>
      </div>

      <section className="lesson-pricing-card" data-motion-item="lessons-pricing" aria-label="Lesson pricing">
        <h3>{pricingContent.title}</h3>
        <div className="lesson-pricing-grid">
          <div>
            <h4>{pricingContent.min30Label}</h4>
            <p>{pricingContent.min30Option1}</p>
            <p>{pricingContent.min30Option2}</p>
          </div>
          <div>
            <h4>{pricingContent.min60Label}</h4>
            <p>{pricingContent.min60Option1}</p>
            <p>{pricingContent.min60Option2}</p>
          </div>
        </div>
        <p className="lesson-pricing-note">{pricingContent.note}</p>
      </section>

      <div className="button-row button-row-justify" data-motion-item="lessons-actions">
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
