import type { Metadata } from "next";

import { ContactForm } from "@/components/contact-form";
import { ImageModal } from "@/components/image-modal";
import { PanelLayout } from "@/components/panel-layout";
import { getOwnerEmail } from "@/lib/env";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Contact Melbourne Guitar School | Northcote Guitar Lessons",
  path: "/contact",
  description:
    "Contact Melbourne Guitar School to book private guitar tuition, ask questions, or discuss the right lesson path. Studio based in Northcote, Melbourne."
});

/**
 * Public contact page wrapper with location guidance + contact form.
 *
 * Contact details are rendered directly here for immediate access even if the contact form is not used.
 */
export default function ContactPage() {
  const contactEmail = getOwnerEmail();

  return (
    <PanelLayout
      kicker="Inquiries"
      title="Let’s map out the right next step for your playing."
      lead="Reach out by call, text, or email for bookings, guitar tuition options, pricing, vouchers, or general questions. We can help you choose the best place to begin based on your level, musical interests, and what kind of player you want to become."
      viewClassName="view-contact-page"
      visualLabel="Guitar lesson studio"
      visualClassName="contact-hero"
      leadJustified
    >
      <ul className="list" data-motion-item="contact-list">
        <li data-motion-item="map-button">
          <ImageModal
            src="/images/google-map.jpg"
            alt="Melbourne Guitar School location map"
            triggerText="Google Maps Location"
            caption={
              "Melbourne Guitar School Location & Directions\n\n" +
              "Address: Rear 66/68 High St, Northcote\n\n" +
              "We are located in the back alleyway off High Street, directly behind Vex Restaurant.\n\n" +
              "How to Find Us:\n" +
              "• On Foot: The entrance to the alleyway is on Westgarth Street, right next to Ultratune.\n" +
              "• Driving & Parking: You can access the alleyway by car via 1 Cornwall Street, Northcote. There is usually plenty of street parking available on Cornwall Street.\n\n" +
              "What to Look For:\n" +
              "Keep an eye out for a black, double-story building with a roller door and a yellow MGS sign out front."
            }
          />
        </li>
        <li data-motion-item="contact-phone">Phone: 0401 489 437</li>
        <li data-motion-item="contact-email">Email: {contactEmail}</li>
        <li data-motion-item="contact-studio">Studio: Rear 66/68 High St, Northcote VIC 3070</li>
        <li data-motion-item="contact-formats">Lesson formats: In-person (VIC) and online (Australia)</li>
      </ul>

      <p className="helper-text" data-motion-item="contact-helper-copy">
        If you are unsure where to start, send a quick message about your current level, the styles you enjoy, and what you want to achieve. We can help you choose the right guitar tuition format and a practical, motivating first step.
      </p>

      <ContactForm />
    </PanelLayout>
  );
}
