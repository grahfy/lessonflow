import type { Metadata } from "next";

import { BookingForm } from "@/components/booking-form";
import { PanelLayout } from "@/components/panel-layout";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Book a Lesson",
  path: "/book",
  description:
    "Request a guitar lesson with Melbourne Guitar School. Submit your preferred time and details for approval. In-person and online lessons available."
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
      title="Request a lesson and get owner approval."
      lead="Submit your preferred lesson time and details. Requests are reviewed and confirmed by the owner."
      viewClassName="view-book-page"
      visualLabel="Booking"
      visualClassName="contact-hero"
      leadJustified
    >
      <p className="helper-text" data-motion-item="book-helper-text">
        Booking requests are currently limited to the active calendar year and are approved manually to avoid clashes.
      </p>
      <BookingForm />
    </PanelLayout>
  );
}
