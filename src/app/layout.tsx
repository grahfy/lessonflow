import type { Metadata } from "next";
import { PropsWithChildren } from "react";

import { MotionProvider } from "@/components/motion/tween-orchestrator";
import { PublicSiteFrame } from "@/components/public-site-frame";
import { GlobalTooltipProvider } from "@/components/ui/global-tooltip-provider";
import { getBranding, getSubjectLabel } from "@/lib/branding";
import { getPublicSiteUrl } from "@/lib/env";
import "@/styles/globals.css";
import "@/styles/admin.css";
import "@/styles/extended-features.css";

export function generateMetadata(): Metadata {
  const branding = getBranding();
  const subjectLabel = getSubjectLabel(branding.PRIMARY_SUBJECT);
  const baseUrl = getPublicSiteUrl().replace(/\/+$/, "");

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: `${branding.PUBLIC_BRAND_NAME}: Creative ${subjectLabel} Lessons in ${branding.PRIMARY_LOCATION}`,
      template: `%s | ${branding.PUBLIC_BRAND_NAME}`,
    },
    description:
      `Modern ${branding.PRIMARY_SUBJECT.toLowerCase()} lessons in ${branding.PRIMARY_LOCATION}, Melbourne. Learn ${branding.PRIMARY_SUBJECT.toLowerCase()} for beginners to advanced players. Personalised in-person and online music lessons.`,
    keywords: [
      `${branding.PRIMARY_SUBJECT.toLowerCase()} lessons Melbourne`,
      `${branding.PRIMARY_SUBJECT.toLowerCase()} lessons ${branding.PRIMARY_LOCATION}`,
      `${branding.PRIMARY_SUBJECT.toLowerCase()} teacher Melbourne`,
      `${branding.PRIMARY_SUBJECT.toLowerCase()} teacher ${branding.PRIMARY_LOCATION}`,
      `learn ${branding.PRIMARY_SUBJECT.toLowerCase()} Melbourne`,
      `learn ${branding.PRIMARY_SUBJECT.toLowerCase()} ${branding.PRIMARY_LOCATION}`,
      `music school Melbourne`,
      `music school ${branding.PRIMARY_LOCATION}`,
      `online ${branding.PRIMARY_SUBJECT.toLowerCase()} lessons`,
      `in-person ${branding.PRIMARY_SUBJECT.toLowerCase()} lessons`,
    ],
    authors: [{ name: branding.PUBLIC_BRAND_NAME }],
    creator: branding.PUBLIC_BRAND_NAME,
    publisher: branding.PUBLIC_BRAND_NAME,
    applicationName: branding.PUBLIC_BRAND_NAME,
    alternates: {
      canonical: "/"
    },
    icons: {
      icon: branding.FAVICON_URL,
      shortcut: branding.FAVICON_URL,
      apple: branding.FAVICON_URL
    },
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    openGraph: {
      type: "website",
      locale: "en_AU",
      url: baseUrl,
      siteName: branding.PUBLIC_BRAND_NAME,
      title: branding.PUBLIC_BRAND_NAME,
      description:
        `Modern ${branding.PRIMARY_SUBJECT.toLowerCase()} lessons in ${branding.PRIMARY_LOCATION} for beginners through advanced players. Learn with an experienced teacher offering personalised lessons in-person and online.`,
      countryName: "Australia",
      images: [
        {
          url: branding.LOGO_URL,
          alt: branding.PUBLIC_BRAND_NAME
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: branding.PUBLIC_BRAND_NAME,
      description:
        `Modern ${branding.PRIMARY_SUBJECT.toLowerCase()} lessons in ${branding.PRIMARY_LOCATION} for beginners through advanced players.`,
      images: [branding.LOGO_URL]
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

export default function RootLayout({ children }: PropsWithChildren) {
  const branding = getBranding();

  return (
    <html lang="en">
      <body>
        <GlobalTooltipProvider>
          <MotionProvider>
            <PublicSiteFrame brandName={branding.PUBLIC_BRAND_NAME}>{children}</PublicSiteFrame>
          </MotionProvider>
        </GlobalTooltipProvider>
      </body>
    </html>
  );
}
