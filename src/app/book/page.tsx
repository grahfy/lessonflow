import { BookingForm } from "@/components/booking-form";
import { PanelLayout } from "@/components/panel-layout";

export default function BookPage() {
  return (
    <PanelLayout
      kicker="Book Lesson"
      title="Request a lesson and get owner approval."
      lead="Submit your preferred lesson time and details. Requests are reviewed and confirmed by the owner."
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
