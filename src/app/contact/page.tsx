import { ContactForm } from "@/components/contact-form";
import { PanelLayout } from "@/components/panel-layout";

export default function ContactPage() {
  return (
    <PanelLayout
      kicker="Inquiries"
      title="Book lessons or ask anything."
      lead="Reach out by call, text, or email and we will guide you to the right lesson package for your goals."
      visualLabel="Guitar lesson studio"
      visualClassName="contact-hero"
      leadJustified
    >
      <ul className="list" data-motion-item="contact-list">
        <li data-motion-item="contact-phone">Phone: 0401 489 437</li>
        <li data-motion-item="contact-email">Email: melbourneguitarschool@gmail.com</li>
        <li data-motion-item="contact-studio">Studio: Rear 66/68 High St, Northcote VIC 3070</li>
        <li data-motion-item="contact-formats">Lesson formats: In-person and online</li>
      </ul>

      <ContactForm />
    </PanelLayout>
  );
}
