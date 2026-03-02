import type { Metadata } from "next";
import { PropsWithChildren } from "react";

import { MotionProvider } from "@/components/motion/tween-orchestrator";
import { PublicSiteFrame } from "@/components/public-site-frame";
import { 
  PUBLIC_BRAND_NAME, 
  PRIMARY_SUBJECT, 
  PRIMARY_LOCATION, 
  LOGO_URL,
  getSubjectLabel 
} from "@/lib/branding";
import "@/styles/globals.css";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: `${PUBLIC_BRAND_NAME}: Creative ${getSubjectLabel()} Lessons in ${PRIMARY_LOCATION}`,
    template: `%s | ${PUBLIC_BRAND_NAME}`,
  },
  description:
    `Modern ${PRIMARY_SUBJECT.toLowerCase()} lessons in ${PRIMARY_LOCATION}, Melbourne. Learn ${PRIMARY_SUBJECT.toLowerCase()} for beginners to advanced players. Personalised in-person and online music lessons.`,
  keywords: [
    `${PRIMARY_SUBJECT.toLowerCase()} lessons Melbourne`,
    `${PRIMARY_SUBJECT.toLowerCase()} lessons ${PRIMARY_LOCATION}`,
    `${PRIMARY_SUBJECT.toLowerCase()} teacher Melbourne`,
    `${PRIMARY_SUBJECT.toLowerCase()} teacher ${PRIMARY_LOCATION}`,
    `learn ${PRIMARY_SUBJECT.toLowerCase()} Melbourne`,
    `learn ${PRIMARY_SUBJECT.toLowerCase()} ${PRIMARY_LOCATION}`,
    `music school Melbourne`,
    `music school ${PRIMARY_LOCATION}`,
    `online ${PRIMARY_SUBJECT.toLowerCase()} lessons`,
    `in-person ${PRIMARY_SUBJECT.toLowerCase()} lessons`,
  ],
  authors: [{ name: PUBLIC_BRAND_NAME }],
  creator: PUBLIC_BRAND_NAME,
  publisher: PUBLIC_BRAND_NAME,
  applicationName: PUBLIC_BRAND_NAME,
  alternates: {
    canonical: "/"
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
    siteName: PUBLIC_BRAND_NAME,
    title: PUBLIC_BRAND_NAME,
    description:
      `Modern ${PRIMARY_SUBJECT.toLowerCase()} lessons in ${PRIMARY_LOCATION} for beginners through advanced players. Learn with an experienced teacher offering personalised lessons in-person and online.`,
    countryName: "Australia",
    images: [
      {
        url: LOGO_URL,
        alt: PUBLIC_BRAND_NAME
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: PUBLIC_BRAND_NAME,
    description:
      `Modern ${PRIMARY_SUBJECT.toLowerCase()} lessons in ${PRIMARY_LOCATION} for beginners through advanced players.`,
    images: [LOGO_URL]
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

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body>
        <MotionProvider>
          <PublicSiteFrame>{children}</PublicSiteFrame>
        </MotionProvider>
      </body>
    </html>
  );
}
