import type { Metadata } from "next";

import { getPublicSiteUrl } from "@/lib/env";
import { getBranding, getSubjectLabel } from "@/lib/branding";

type PublicPageMetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
};

/**
 * Interpolates brand-level placeholders in SEO strings.
 */
function interpolateSeo(text: string): string {
  if (!text) return "";
  const branding = getBranding();
  return text
    .replace(/\{\{BRAND_NAME\}\}/g, branding.PUBLIC_BRAND_NAME)
    .replace(/\{\{SUBJECT\}\}/g, branding.PRIMARY_SUBJECT)
    .replace(/\{\{SUBJECT_LABEL\}\}/g, getSubjectLabel(branding.PRIMARY_SUBJECT))
    .replace(/\{\{LOCATION\}\}/g, branding.PRIMARY_LOCATION);
}

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
  const branding = getBranding();
  const base = getSeoSiteUrl();
  const path = input.path === "/" ? "/" : `/${input.path.replace(/^\/+/, "")}`;
  const url = `${base}${path === "/" ? "" : path}`;
  const imageUrl = branding.LOGO_URL.startsWith("http") ? branding.LOGO_URL : `${base}${branding.LOGO_URL}`;

  const title = interpolateSeo(input.title);
  const description = interpolateSeo(input.description);
  const keywords = (input.keywords || []).map(interpolateSeo);

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: path
    },
    openGraph: {
      type: "website",
      siteName: branding.PUBLIC_BRAND_NAME,
      locale: "en_AU",
      url,
      title,
      description,
      images: [
        {
          url: imageUrl,
          alt: branding.PUBLIC_BRAND_NAME
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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
