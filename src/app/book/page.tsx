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
      <p className="helper-text" data-motion-item="book-helper-text">
        Your first step to a tailored lesson plan. Requests are manually reviewed to confirm availability and match the right format. In-person lessons in VIC, online across Australia.
      </p>
      <BookingForm />
    </PanelLayout>
  );
}
