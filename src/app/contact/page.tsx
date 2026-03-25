import type { Metadata } from "next";

import { ContactForm } from "@/components/contact-form";
import { ImageModal } from "@/components/image-modal";
import { PanelLayout } from "@/components/panel-layout";
import { getOwnerEmail } from "@/lib/env";
import { buildPublicPageMetadata } from "@/lib/seo";

import { getContent } from "@/lib/cms";
import { getBranding, getSubjectLabel } from "@/lib/branding";

export function generateMetadata(): Metadata {
  const branding = getBranding();
  const subjectLabel = getSubjectLabel(branding.PRIMARY_SUBJECT);

  return buildPublicPageMetadata({
    title: `Contact ${branding.PUBLIC_BRAND_NAME} | ${branding.PRIMARY_LOCATION} ${subjectLabel} Lessons`,
    path: "/contact",
    description:
      `Contact ${branding.PUBLIC_BRAND_NAME} to book private ${branding.PRIMARY_SUBJECT.toLowerCase()} tuition, ask questions, or discuss the right lesson path. Studio based in ${branding.PRIMARY_LOCATION}, Melbourne.`
  });
}

/**
 * Public contact page wrapper with location guidance + contact form.
 *
 * Contact details are rendered directly here for immediate access even if the contact form is not used.
 */
export default async function ContactPage() {
  const contactEmail = getOwnerEmail();
  const branding = getBranding();
  const subjectLabel = getSubjectLabel(branding.PRIMARY_SUBJECT);

  const heroContent = await getContent("/contact", "hero", {
    kicker: "Inquiries",
    title: "Let’s map out the right next step for your playing.",
    lead: `Reach out by call, text, or email for bookings, ${branding.PRIMARY_SUBJECT.toLowerCase()} tuition options, pricing, vouchers, or general questions. We can help you choose the best place to begin based on your level, musical interests, and what kind of player you want to become.`,
    visualLabel: `${subjectLabel} lesson studio`,
    visualClassName: "contact-hero"
  });

  const bodyContent = await getContent("/contact", "body", {
    mapImage: "/images/google-map.webp",
    mapTriggerText: "Google Maps Location",
    mapCaption: `${branding.PUBLIC_BRAND_NAME} Location & Directions\n\nAddress: ${branding.CONTACT_ADDRESS}\n\nContact us for detailed directions to our ${branding.PRIMARY_LOCATION} studio.`,
    formatsLabel: `Lesson formats: In-person (${branding.PRIMARY_LOCATION}) and online (Australia)`,
    helperText: `If you are unsure where to start, send a quick message about your current level, the styles you enjoy, and what you want to achieve. We can help you choose the right ${branding.PRIMARY_SUBJECT.toLowerCase()} tuition format and a practical, motivating first step.`
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
        <li className="map-trigger-item" data-motion-item="map-button">
          <ImageModal
            src={bodyContent.mapImage}
            alt={`${branding.PUBLIC_BRAND_NAME} location map`}
            triggerText={bodyContent.mapTriggerText}
            caption={bodyContent.mapCaption}
          />
        </li>
        <li data-motion-item="contact-phone">Phone: {branding.CONTACT_PHONE}</li>
        <li data-motion-item="contact-email">Email: {contactEmail}</li>
        <li data-motion-item="contact-studio">Studio: {branding.CONTACT_ADDRESS}</li>
        <li data-motion-item="contact-formats">{bodyContent.formatsLabel}</li>
      </ul>

      <p className="helper-text copy-justify" data-motion-item="contact-helper-copy">
        {bodyContent.helperText}
      </p>

      <ContactForm />
    </PanelLayout>
  );
}
