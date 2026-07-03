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

  // The root layout applies a "%s | {brand}" title template. Pages whose title
  // already carries the brand must opt out via `absolute`, otherwise the brand
  // is duplicated (e.g. "Book a Lesson | Brand | Brand"). Pages without the
  // brand keep the plain string so the template appends it once.
  const titleField = title.includes(branding.PUBLIC_BRAND_NAME) ? { absolute: title } : title;

  return {
    title: titleField,
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
 * Parses the free-form CONTACT_ADDRESS ("Street, Suburb STATE POSTCODE") into
 * schema.org PostalAddress fields. Falls back to using the whole string as the
 * street address when the trailing "Suburb STATE POSTCODE" pattern is absent.
 */
function parsePostalAddress(address: string): Record<string, string> {
  const result: Record<string, string> = { "@type": "PostalAddress", addressCountry: "AU" };
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const tail = parts.at(-1) ?? "";
  const match = tail.match(/^(.*?)\s+([A-Z]{2,3})\s+(\d{4})$/);
  if (match) {
    const street = parts.slice(0, -1).join(", ");
    if (street) result.streetAddress = street;
    result.addressLocality = match[1];
    result.addressRegion = match[2];
    result.postalCode = match[3];
  } else if (address) {
    result.streetAddress = address;
  }
  return result;
}

/**
 * Builds MusicSchool (LocalBusiness) JSON-LD from real branding data for the
 * public site. Emitted once site-wide from the root layout so search engines
 * can surface the school's name, location, and contact details.
 */
export function buildOrganizationJsonLd(): Record<string, unknown> {
  const branding = getBranding();
  const base = getSeoSiteUrl();
  const logo = branding.LOGO_URL.startsWith("http") ? branding.LOGO_URL : `${base}${branding.LOGO_URL}`;
  const subject = branding.PRIMARY_SUBJECT.toLowerCase();

  return {
    "@context": "https://schema.org",
    "@type": "MusicSchool",
    name: branding.PUBLIC_BRAND_NAME,
    url: base,
    logo,
    image: logo,
    telephone: branding.CONTACT_PHONE,
    description: `${branding.PUBLIC_BRAND_NAME} offers ${subject} lessons in ${branding.PRIMARY_LOCATION}, Melbourne — in-person and online, for beginners through advanced players.`,
    address: parsePostalAddress(branding.CONTACT_ADDRESS),
    areaServed: { "@type": "City", name: "Melbourne" }
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
