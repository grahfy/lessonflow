import type { Metadata } from "next";
import { PropsWithChildren } from "react";

import { MotionProvider } from "@/components/motion/tween-orchestrator";
import { PublicSiteFrame } from "@/components/public-site-frame";
import "@/styles/globals.css";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Melbourne Guitar School - Learn Guitar with Jon King",
    template: "%s | Melbourne Guitar School",
  },
  description:
    "Modern guitar lessons in Northcote, Melbourne with Jon King. Learn guitar for beginners to advanced players. Personalised in-person and online music lessons.",
  keywords: [
    // Guitar lessons
    "guitar lessons Melbourne",
    "guitar lessons Northcote",
    "guitar lessons Fairfield",
    "guitar lessons Alphington",
    "guitar lessons Ivanhoe",
    "guitar lessons Preston",
    "guitar lessons Thornbury",
    "guitar lessons Reservoir",
    "guitar teacher Melbourne",
    "guitar teacher Northcote",
    "learn guitar Melbourne",
    "learn guitar Northcote",
    "guitar classes Melbourne",
    "beginner guitar lessons Melbourne",
    "advanced guitar lessons Melbourne",
    "acoustic guitar lessons",
    "electric guitar lessons",
    "kids guitar lessons Melbourne",
    "adult guitar lessons Melbourne",
    "guitar tuition Melbourne",
    // Music lessons
    "music lessons Melbourne",
    "music lessons Northcote",
    "music tuition Melbourne",
    "music tutoring Northcote",
    "music education Melbourne",
    "music school Melbourne",
    "music academy Melbourne",
    // Lesson delivery
    "online guitar lessons",
    "online music lessons",
    "in-person guitar lessons",
    "in-person music lessons",
    // Teacher - Jon King
    "Jon King guitar teacher",
    "Jon King music teacher",
    "Jon King Melbourne",
    "guitar teacher Jon King",
    "music teacher Jon King",
    // Genres
    "rock guitar lessons Melbourne",
    "blues guitar lessons Melbourne",
    "jazz guitar lessons Melbourne",
    "fingerstyle guitar lessons",
    "classical guitar lessons Melbourne",
    // School name
    "guitar school Northcote",
  ],
  authors: [{ name: "Melbourne Guitar School" }],
  creator: "Melbourne Guitar School",
  publisher: "Melbourne Guitar School",
  applicationName: "Melbourne Guitar School",
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
    siteName: "Melbourne Guitar School",
    title: "Melbourne Guitar School",
    description:
      "Modern guitar lessons in Northcote for beginners through advanced players. Learn with an experienced teacher offering personalised lessons in-person and online.",
    countryName: "Australia",
    images: [
      {
        url: "/images/mgs-logo.png",
        alt: "Melbourne Guitar School"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Melbourne Guitar School",
    description:
      "Modern guitar lessons in Northcote for beginners through advanced players.",
    images: ["/images/mgs-logo.png"]
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
