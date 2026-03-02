/**
 * Centralized branding and identity constants.
 * These values are sourced from environment variables where possible,
 * with fallback defaults for the LessonFlow platform.
 * 
 * NOTE: Defaults are set to "Melbourne Guitar School" to ensure that existing 
 * production deployments remain unchanged until explicitly configured.
 */

export const PUBLIC_BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "Melbourne Guitar School";
export const PLATFORM_NAME = "LessonFlow";

export const PRIMARY_SUBJECT = process.env.NEXT_PUBLIC_PRIMARY_SUBJECT || "Guitar";
export const PRIMARY_LOCATION = process.env.NEXT_PUBLIC_PRIMARY_LOCATION || "Northcote";

export const CONTACT_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE || "0401 489 437";
export const CONTACT_ADDRESS = process.env.NEXT_PUBLIC_CONTACT_ADDRESS || "Rear 66/68 High St, Northcote VIC 3070";

export const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL || "/images/mgs-logo.webp";
// pdf-lib does not support WebP, so we fallback to PNG for invoices.
export const INVOICE_LOGO_URL = process.env.NEXT_PUBLIC_INVOICE_LOGO_URL || "/images/company-logo-invoice.png";
export const FAVICON_URL = process.env.NEXT_PUBLIC_FAVICON_URL || "/favicon.ico";

export const DEFAULT_CURRENCY = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || "AUD";

export const POWERED_BY_PLATFORM_COPY = `Powered by ${PLATFORM_NAME}`;
export const STUDENT_PORTAL_PLATFORM_NAME = `${PLATFORM_NAME} Student Portal`;

/**
 * Returns a capitalized version of the primary subject (e.g. "Guitar").
 */
export function getSubjectLabel(): string {
  return PRIMARY_SUBJECT.charAt(0).toUpperCase() + PRIMARY_SUBJECT.slice(1);
}

/**
 * Returns the full brand title, often used in SEO and headers.
 */
export function getBrandTitle(): string {
  return PUBLIC_BRAND_NAME;
}
