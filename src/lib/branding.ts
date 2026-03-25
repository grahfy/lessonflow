/**
 * Centralized Branding & Identity Registry
 * 
 * Provides a unified source of truth for the school's brand identity (Names, 
 * Logos, Contact Info). Sourced primarily from environment variables.
 * 
 * DESIGN RATIONALE:
 * 1. Dynamic Updates: We prefer `getBranding()` over static constants so that 
 *    changes made via the Admin UI (which updates .env or process memory) are 
 *    reflected immediately without requiring a full application restart in 
 *    environments that support dynamic process.env.
 * 2. Fallback Defaults: Provides sensible defaults for the LessonFlow 
 *    platform to ensure the UI never renders empty branding slots.
 */

export const PLATFORM_NAME = "LessonFlow";

export type BrandingConfig = {
  PUBLIC_BRAND_NAME: string;
  PRIMARY_SUBJECT: string;
  PRIMARY_LOCATION: string;
  CONTACT_PHONE: string;
  CONTACT_ADDRESS: string;
  LOGO_URL: string;
  INVOICE_LOGO_URL: string;
  FAVICON_URL: string;
  DEFAULT_CURRENCY: string;
};

export function getDefaultCurrency(): string {
  const candidate = (process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || "AUD").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(candidate) ? candidate : "AUD";
}

/**
 * Resolves the full branding object from the environment.
 * RATIONALE: Used by layout components to ensure they have the latest 
 * school identity without being tightly coupled to specific ENV keys.
 */
export function getBranding(): BrandingConfig {
  return {
    PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME || "Melbourne Guitar School",
    PRIMARY_SUBJECT: process.env.NEXT_PUBLIC_PRIMARY_SUBJECT || "Guitar",
    PRIMARY_LOCATION: process.env.NEXT_PUBLIC_PRIMARY_LOCATION || "Northcote",
    CONTACT_PHONE: process.env.NEXT_PUBLIC_CONTACT_PHONE || "0401 489 437",
    CONTACT_ADDRESS: process.env.NEXT_PUBLIC_CONTACT_ADDRESS || "Rear 66/68 High St, Northcote VIC 3070",
    LOGO_URL: process.env.NEXT_PUBLIC_LOGO_URL || "/images/mgs-logo.webp",
    INVOICE_LOGO_URL: process.env.NEXT_PUBLIC_INVOICE_LOGO_URL || "/images/company-logo-invoice.png",
    FAVICON_URL: process.env.NEXT_PUBLIC_FAVICON_URL || "/favicon.ico",
    DEFAULT_CURRENCY: getDefaultCurrency(),
  };
}

// Legacy constants for backward compatibility with existing components.
export const PUBLIC_BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "Melbourne Guitar School";
export const PRIMARY_SUBJECT = process.env.NEXT_PUBLIC_PRIMARY_SUBJECT || "Guitar";
export const PRIMARY_LOCATION = process.env.NEXT_PUBLIC_PRIMARY_LOCATION || "Northcote";
export const CONTACT_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE || "0401 489 437";
export const CONTACT_ADDRESS = process.env.NEXT_PUBLIC_CONTACT_ADDRESS || "Rear 66/68 High St, Northcote VIC 3070";
export const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL || "/images/mgs-logo.webp";
export const INVOICE_LOGO_URL = process.env.NEXT_PUBLIC_INVOICE_LOGO_URL || "/images/company-logo-invoice.png";
export const FAVICON_URL = process.env.NEXT_PUBLIC_FAVICON_URL || "/favicon.ico";
export const DEFAULT_CURRENCY = getDefaultCurrency();

export const POWERED_BY_PLATFORM_COPY = `Powered by ${PLATFORM_NAME}`;
export const STUDENT_PORTAL_PLATFORM_NAME = `${PLATFORM_NAME} Student Portal`;

/** Capitalized version of the primary instrument. */
export function getSubjectLabel(subjectValue?: string): string {
  const subject = (subjectValue || getBranding().PRIMARY_SUBJECT).trim();
  return subject.charAt(0).toUpperCase() + subject.slice(1);
}

/** Primary school name. */
export function getBrandTitle(): string {
  return getBranding().PUBLIC_BRAND_NAME;
}
