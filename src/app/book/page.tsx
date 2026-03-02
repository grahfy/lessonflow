import type { Metadata } from "next";

import { BookingForm } from "@/components/booking-form";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";
import { 
  PUBLIC_BRAND_NAME, 
  PRIMARY_SUBJECT, 
  PRIMARY_LOCATION,
  getSubjectLabel 
} from "@/lib/branding";
import { getContent } from "@/lib/cms";

export const metadata: Metadata = buildPublicPageMetadata({
  title: `Book a ${getSubjectLabel()} Lesson | ${PUBLIC_BRAND_NAME}`,
  path: "/book",
  description:
    `Request your ${PRIMARY_SUBJECT.toLowerCase()} tuition session in minutes. Share your goals and preferred time, and we will confirm availability and the best fit for your playing.`
});

/**
 * Public booking page wrapper.
 *
 * The page-level copy sets expectations (manual approval + current-year limit) while the detailed
 * validation and submission flow live in `BookingForm`.
 */
export default async function BookPage() {
  const heroContent = await getContent("/book", "hero", {
    kicker: "Book Lesson",
    title: "Request a lesson. We'll shape your starting point.",
    lead: "Share your goals and preferred time. Each request is manually reviewed to match you with the right lesson format for your level and musical direction.",
    visualLabel: "Booking",
    visualClassName: "contact-hero"
  });

  const bodyContent = await getContent("/book", "body", {
    card1Title: "How It Works",
    card1Body: "Submit your preferred time and goals. We manually review every request to confirm availability and ensure the best fit for your level.",
    card2Title: "Who It Suits",
    card2Body: "Beginners through to advanced players. All ages are welcome, with coaching tailored to your musical interests and creative goals.",
    card3Title: "Flexible Formats",
    card3Body: `Choose between focused in-person sessions at our ${PRIMARY_LOCATION} studio or high-quality video lessons from anywhere across Australia.`
  });

  return (
    <PanelLayout
      kicker={heroContent.kicker}
      title={heroContent.title}
      lead={heroContent.lead}
      viewClassName="view-book-page"
      visualLabel={heroContent.visualLabel}
      visualClassName={heroContent.visualClassName}
      leadJustified
    >
      <div className="card-grid" data-motion-item="book-cards">
        <article className="info-card" data-motion-item="book-how-card">
          <h3>{bodyContent.card1Title}</h3>
          <p>{bodyContent.card1Body}</p>
        </article>
        <article className="info-card" data-motion-item="book-who-card">
          <h3>{bodyContent.card2Title}</h3>
          <p>{bodyContent.card2Body}</p>
        </article>
        <article className="info-card" data-motion-item="book-formats-card">
          <h3>{bodyContent.card3Title}</h3>
          <p>{bodyContent.card3Body}</p>
        </article>
      </div>

      <BookingForm />
    </PanelLayout>
  );
}
