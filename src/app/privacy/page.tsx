import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { getBranding, getSubjectLabel } from "@/lib/branding";
import { getOwnerEmail } from "@/lib/env";
import { buildPublicPageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  const branding = getBranding();

  return buildPublicPageMetadata({
    title: `Privacy Policy | ${branding.PUBLIC_BRAND_NAME}`,
    path: "/privacy",
    description:
      `Read how ${branding.PUBLIC_BRAND_NAME} handles student, booking, and Google-connected service data when you use the website and student portal.`
  });
}

export default function PrivacyPage() {
  const ownerEmail = getOwnerEmail();
  const branding = getBranding();
  const subjectLabel = getSubjectLabel(branding.PRIMARY_SUBJECT);

  return (
    <PanelLayout
      kicker="Privacy"
      title="How information is collected and used."
      lead={`This policy explains how ${branding.PUBLIC_BRAND_NAME} collects, uses, and protects personal information when you make inquiries, request lessons, or use the student portal. It also covers limited Google-connected service data used for operational email workflows.`}
      visualLabel="Privacy policy"
      visualClassName="terms-hero"
      leadJustified
    >
      <ul className="list" data-motion-item="privacy-list">
        <li data-motion-item="privacy-item-identity">
          We collect the personal details needed to run lessons and support requests, including names, contact details, postcode, booking history, invoices, and assigned learning materials.
        </li>
        <li data-motion-item="privacy-item-portal">
          Student portal access is used so students can sign in, view lesson details, and open materials linked to their account. Access credentials and session data are used only to operate that portal securely.
        </li>
        <li data-motion-item="privacy-item-google">
          When Google APIs are enabled by the school operator, the platform may access authorized Google account data needed to send school email, read relevant inbox content, and process communication workflows connected to lesson administration and customer support.
        </li>
        <li data-motion-item="privacy-item-retention">
          Information is used for bookings, scheduling, invoicing, lesson delivery, customer support, security, and operational records. Data is not sold to third parties.
        </li>
        <li data-motion-item="privacy-item-rights">
          You can request access, correction, or deletion of your information by contacting us. Some records may be retained where needed for legal, accounting, or legitimate business purposes.
        </li>
      </ul>

      <p className="helper-text copy-justify" data-motion-item="privacy-contact-copy">
        Privacy questions or requests can be sent to {ownerEmail} or raised by phone on {branding.CONTACT_PHONE}. If this policy changes materially, the updated version will be published on this page.
      </p>

      <p className="helper-text copy-justify" data-motion-item="privacy-scope-copy">
        This page is intended to satisfy public disclosure requirements for the website, the {subjectLabel.toLowerCase()} lesson student portal, and connected Google API workflows used to operate communications for the school.
      </p>

      <div className="button-row button-row-justify" data-motion-item="privacy-actions">
        <TweenLink className="btn btn-primary" href="/contact" data-motion-item="privacy-action-contact">
          Contact Us
        </TweenLink>
        <TweenLink className="btn btn-secondary" href="/student/login" data-motion-item="privacy-action-login">
          Back to Student Login
        </TweenLink>
      </div>
    </PanelLayout>
  );
}
