import type { Metadata } from "next";
import { PropsWithChildren } from "react";

import { MotionProvider } from "@/components/motion/tween-orchestrator";
import { PublicSiteFrame } from "@/components/public-site-frame";
import "@/styles/globals.css";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Melbourne Guitar School",
    template: "%s | Melbourne Guitar School",
  },
  description:
    "Modern guitar lessons in Northcote for beginners through advanced players. Learn with an experienced teacher offering personalised lessons in-person and online.",
  keywords: [
    "guitar lessons Melbourne",
    "guitar teacher Northcote",
    "learn guitar",
    "music lessons",
    "guitar classes",
    "beginner guitar lessons",
    "advanced guitar lessons",
    "online guitar lessons",
  ],
  authors: [{ name: "Melbourne Guitar School" }],
  creator: "Melbourne Guitar School",
  publisher: "Melbourne Guitar School",
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
  },
  twitter: {
    card: "summary_large_image",
    title: "Melbourne Guitar School",
    description:
      "Modern guitar lessons in Northcote for beginners through advanced players.",
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
