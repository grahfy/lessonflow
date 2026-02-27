import type { Metadata } from "next";

import { BookingForm } from "@/components/booking-form";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Book a Guitar Lesson | Melbourne Guitar School",
  path: "/book",
  description:
    "Request your guitar tuition session in minutes. Share your goals and preferred time, and we will confirm availability and the best fit for your playing."
});

/**
 * Public booking page wrapper.
 *
 * The page-level copy sets expectations (manual approval + current-year limit) while the detailed
 * validation and submission flow live in `BookingForm`.
 */
export default function BookPage() {
  return (
    <PanelLayout
      kicker="Book Lesson"
      title="Request a lesson. We'll shape your starting point."
      lead="Share your goals and preferred time. Each request is manually reviewed to match you with the right lesson format for your level and musical direction."
      viewClassName="view-book-page"
      visualLabel="Booking"
      visualClassName="contact-hero"
      leadJustified
    >
      <div className="card-grid" data-motion-item="book-cards">
        <article className="info-card" data-motion-item="book-how-card">
          <h3>How It Works</h3>
          <p>Submit your preferred time and goals. We manually review every request to confirm availability and ensure the best fit for your level.</p>
        </article>
        <article className="info-card" data-motion-item="book-who-card">
          <h3>Who It Suits</h3>
          <p>Beginners through to advanced players. All ages are welcome, with coaching tailored to your musical interests and creative goals.</p>
        </article>
        <article className="info-card" data-motion-item="book-formats-card">
          <h3>Flexible Formats</h3>
          <p>Choose between focused in-person sessions at our Northcote studio or high-quality video lessons from anywhere across Australia.</p>
        </article>
      </div>

      <BookingForm />
    </PanelLayout>
  );
}
