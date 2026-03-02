import type { Metadata } from "next";

import { ContactForm } from "@/components/contact-form";
import { ImageModal } from "@/components/image-modal";
import { PanelLayout } from "@/components/panel-layout";
import { getOwnerEmail } from "@/lib/env";
import { buildPublicPageMetadata } from "@/lib/seo";

import { getContent } from "@/lib/cms";
import { 
  PUBLIC_BRAND_NAME, 
  PRIMARY_SUBJECT, 
  PRIMARY_LOCATION,
  CONTACT_PHONE,
  CONTACT_ADDRESS,
  getSubjectLabel
} from "@/lib/branding";

export const metadata: Metadata = buildPublicPageMetadata({
  title: `Contact ${PUBLIC_BRAND_NAME} | ${PRIMARY_LOCATION} ${getSubjectLabel()} Lessons`,
  path: "/contact",
  description:
    `Contact ${PUBLIC_BRAND_NAME} to book private ${PRIMARY_SUBJECT.toLowerCase()} tuition, ask questions, or discuss the right lesson path. Studio based in ${PRIMARY_LOCATION}, Melbourne.`
});

/**
 * Public contact page wrapper with location guidance + contact form.
 *
 * Contact details are rendered directly here for immediate access even if the contact form is not used.
 */
export default async function ContactPage() {
  const contactEmail = getOwnerEmail();

  const heroContent = await getContent("/contact", "hero", {
    kicker: "Inquiries",
    title: "Let’s map out the right next step for your playing.",
    lead: `Reach out by call, text, or email for bookings, ${PRIMARY_SUBJECT.toLowerCase()} tuition options, pricing, vouchers, or general questions. We can help you choose the best place to begin based on your level, musical interests, and what kind of player you want to become.`,
    visualLabel: `${getSubjectLabel()} lesson studio`,
    visualClassName: "contact-hero"
  });

  const bodyContent = await getContent("/contact", "body", {
    mapImage: "/images/google-map.webp",
    mapTriggerText: "Google Maps Location",
    mapCaption: `${PUBLIC_BRAND_NAME} Location & Directions\n\nAddress: ${CONTACT_ADDRESS}\n\nContact us for detailed directions to our ${PRIMARY_LOCATION} studio.`,
    formatsLabel: `Lesson formats: In-person (${PRIMARY_LOCATION}) and online (Australia)`,
    helperText: `If you are unsure where to start, send a quick message about your current level, the styles you enjoy, and what you want to achieve. We can help you choose the right ${PRIMARY_SUBJECT.toLowerCase()} tuition format and a practical, motivating first step.`
  });

  return (
    <PanelLayout
      kicker={heroContent.kicker}
      title={heroContent.title}
      lead={heroContent.lead}
      viewClassName="view-contact-page"
      visualLabel={heroContent.visualLabel}
      visualClassName={heroContent.visualClassName}
      leadJustified
    >
      <ul className="list" data-motion-item="contact-list">
        <li data-motion-item="map-button">
          <ImageModal
            src={bodyContent.mapImage}
            alt={`${PUBLIC_BRAND_NAME} location map`}
            triggerText={bodyContent.mapTriggerText}
            caption={bodyContent.mapCaption}
          />
        </li>
        <li data-motion-item="contact-phone">Phone: {CONTACT_PHONE}</li>
        <li data-motion-item="contact-email">Email: {contactEmail}</li>
        <li data-motion-item="contact-studio">Studio: {CONTACT_ADDRESS}</li>
        <li data-motion-item="contact-formats">{bodyContent.formatsLabel}</li>
      </ul>

      <p className="helper-text copy-justify" data-motion-item="contact-helper-copy">
        {bodyContent.helperText}
      </p>

      <ContactForm />
    </PanelLayout>
  );
}
