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
      title="Request a guitar tuition session and we’ll shape the right starting point."
      lead="Tell us what you want to learn, choose your preferred time, and submit your request. Every booking is reviewed manually so your session is confirmed properly and matched to the guitar tuition format that best suits your goals, level, and musical direction."
      viewClassName="view-book-page"
      visualLabel="Booking"
      visualClassName="contact-hero"
      leadJustified
    >
      <p className="helper-text" data-motion-item="book-helper-text">
        Think of this as your first step into a tailored guitar tuition plan. Booking requests are reviewed manually to avoid schedule clashes, confirm availability, and place you in the right guitar tuition format. In-person lessons are currently available in VIC, and online guitar tuition is available across Australia.
      </p>
      <BookingForm />
    </PanelLayout>
  );
}
