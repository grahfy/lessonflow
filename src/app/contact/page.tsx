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
      footerCopy="Fast response by phone, text, or email."
      leadJustified
    >
      <ul className="list">
        <li>Phone: 0401 489 437</li>
        <li>Email: melbourneguitarschool@gmail.com</li>
        <li>Studio: Rear 66/68 High St, Northcote VIC 3070</li>
        <li>Lesson formats: In-person and online</li>
      </ul>

      <ContactForm />
    </PanelLayout>
  );
}
