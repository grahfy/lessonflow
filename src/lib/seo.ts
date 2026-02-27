import type { Metadata } from "next";

import { getPublicSiteUrl } from "@/lib/env";

type PublicPageMetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
};

/**
 * Resolves a stable absolute site URL for canonical links, Open Graph metadata,
 * and sitemap entries.
 */
export function getSeoSiteUrl(): string {
  return getPublicSiteUrl().replace(/\/+$/, "");
}

/**
 * Builds consistent SEO metadata for public marketing pages only.
 *
 * Admin, setup, and student portal routes intentionally use noindex metadata in
 * their own route segments so the public website remains the indexed surface.
 */
export function buildPublicPageMetadata(input: PublicPageMetadataInput): Metadata {
  const base = getSeoSiteUrl();
  const path = input.path === "/" ? "/" : `/${input.path.replace(/^\/+/, "")}`;
  const url = `${base}${path === "/" ? "" : path}`;
  const imageUrl = `${base}/images/mgs-logo.webp`;

  return {
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    alternates: {
      canonical: path
    },
    openGraph: {
      type: "website",
      siteName: "Melbourne Guitar School",
      locale: "en_AU",
      url,
      title: input.title,
      description: input.description,
      images: [
        {
          url: imageUrl,
          alt: "Melbourne Guitar School"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [imageUrl]
    },
    robots: {
      index: true,
      follow: true
    }
  };
}

/**
 * Shared noindex metadata for internal route segments (admin/student/setup).
 */
export const noIndexMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true
    }
  }
};
