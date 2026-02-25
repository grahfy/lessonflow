import type { Metadata } from "next";

import { ContactForm } from "@/components/contact-form";
import { ImageModal } from "@/components/image-modal";
import { PanelLayout } from "@/components/panel-layout";
import { getOwnerEmail } from "@/lib/env";
import { buildPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Contact Us",
  path: "/contact",
  description:
    "Get in touch with Melbourne Guitar School. Call, text, or email to book lessons or ask questions. Located in Northcote, Melbourne."
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
      title="Book lessons or ask anything."
      lead="Reach out by call, text, or email and we will guide you to the right lesson package for your goals."
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
        <li data-motion-item="contact-formats">Lesson formats: In-person and online</li>
      </ul>

      <ContactForm />
    </PanelLayout>
  );
}
