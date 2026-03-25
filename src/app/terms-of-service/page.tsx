import type { Metadata } from "next";

import { TweenLink } from "@/components/motion/tween-link";
import { PanelLayout } from "@/components/panel-layout";
import { PLATFORM_NAME, getBranding } from "@/lib/branding";
import { buildPublicPageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  const branding = getBranding();

  return buildPublicPageMetadata({
    title: `Terms of Service | ${branding.PUBLIC_BRAND_NAME}`,
    path: "/terms-of-service",
    description:
      `Read the service terms for ${branding.PUBLIC_BRAND_NAME}, including website use, student portal access, and connected Google API services.`
  });
}

export default function TermsOfServicePage() {
  const branding = getBranding();

  return (
    <PanelLayout
      kicker="Terms of Service"
      title="Conditions for using the website and student portal."
      lead={`These terms explain the conditions for using ${branding.PUBLIC_BRAND_NAME} online services, including the ${PLATFORM_NAME} student portal and any connected Google-enabled communication tools used by the school.`}
      visualLabel="Terms of service"
      visualClassName="terms-hero"
      leadJustified
    >
      <ul className="list" data-motion-item="terms-service-list">
        <li data-motion-item="terms-service-item-access">
          The website and student portal are provided to support lesson inquiries, customer administration, scheduling, invoicing, and access to assigned learning materials.
        </li>
        <li data-motion-item="terms-service-item-accounts">
          Students must use their own portal credentials and keep them confidential. Access may be suspended or reset if there is suspected misuse, unauthorized access, or a security risk.
        </li>
        <li data-motion-item="terms-service-item-content">
          Materials, messages, and portal content provided through the service are for lesson participation and personal study use unless we state otherwise in writing.
        </li>
        <li data-motion-item="terms-service-item-google">
          Where Google APIs are connected to the service, those features must be used only for legitimate lesson-administration and communication purposes. Use of Google-sourced data remains subject to Google API Services requirements and the permissions granted to the school operator.
        </li>
        <li data-motion-item="terms-service-item-changes">
          We may update or improve the service, or revise these terms, when operational, legal, or security requirements change. Continued use after updates means you accept the revised terms.
        </li>
      </ul>

      <p className="helper-text copy-justify" data-motion-item="terms-service-copy">
        These terms apply to the public website, student login, student portal, and related communication workflows. They sit alongside the separate lesson, cancellation, and voucher policies already published on the main terms page.
      </p>

      <div className="button-row button-row-justify" data-motion-item="terms-service-actions">
        <TweenLink className="btn btn-primary" href="/terms" data-motion-item="terms-service-action-policies">
          View Lesson Policies
        </TweenLink>
        <TweenLink className="btn btn-secondary" href="/student/login" data-motion-item="terms-service-action-login">
          Back to Student Login
        </TweenLink>
      </div>
    </PanelLayout>
  );
}
