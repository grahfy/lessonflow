/**
 * Centralized branding and identity constants.
 * These values are sourced from environment variables where possible,
 * with fallback defaults for the LessonFlow platform.
 */

// Basic platform name is usually immutable
export const PLATFORM_NAME = "LessonFlow";

/**
 * Returns the current branding configuration, sourcing from environment variables
 * to ensure that changes made in the admin settings are reflected without a restart
 * where the runtime supports dynamic process.env updates.
 */
export function getBranding() {
  return {
    PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME || "Melbourne Guitar School",
    PRIMARY_SUBJECT: process.env.NEXT_PUBLIC_PRIMARY_SUBJECT || "Guitar",
    PRIMARY_LOCATION: process.env.NEXT_PUBLIC_PRIMARY_LOCATION || "Northcote",
    CONTACT_PHONE: process.env.NEXT_PUBLIC_CONTACT_PHONE || "0401 489 437",
    CONTACT_ADDRESS: process.env.NEXT_PUBLIC_CONTACT_ADDRESS || "Rear 66/68 High St, Northcote VIC 3070",
    LOGO_URL: process.env.NEXT_PUBLIC_LOGO_URL || "/images/mgs-logo.webp",
    INVOICE_LOGO_URL: process.env.NEXT_PUBLIC_INVOICE_LOGO_URL || "/images/company-logo-invoice.png",
    FAVICON_URL: process.env.NEXT_PUBLIC_FAVICON_URL || "/favicon.ico",
    DEFAULT_CURRENCY: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || "AUD",
  };
}

// Legacy constant exports for backward compatibility. 
// Note: These may become stale if process.env is updated after module load.
// New code should prefer using getBranding() or reading process.env directly.
export const PUBLIC_BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "Melbourne Guitar School";
export const PRIMARY_SUBJECT = process.env.NEXT_PUBLIC_PRIMARY_SUBJECT || "Guitar";
export const PRIMARY_LOCATION = process.env.NEXT_PUBLIC_PRIMARY_LOCATION || "Northcote";
export const CONTACT_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE || "0401 489 437";
export const CONTACT_ADDRESS = process.env.NEXT_PUBLIC_CONTACT_ADDRESS || "Rear 66/68 High St, Northcote VIC 3070";
export const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL || "/images/mgs-logo.webp";
export const INVOICE_LOGO_URL = process.env.NEXT_PUBLIC_INVOICE_LOGO_URL || "/images/company-logo-invoice.png";
export const FAVICON_URL = process.env.NEXT_PUBLIC_FAVICON_URL || "/favicon.ico";
export const DEFAULT_CURRENCY = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || "AUD";

export const POWERED_BY_PLATFORM_COPY = `Powered by ${PLATFORM_NAME}`;
export const STUDENT_PORTAL_PLATFORM_NAME = `${PLATFORM_NAME} Student Portal`;

/**
 * Returns a capitalized version of the primary subject (e.g. "Guitar").
 */
export function getSubjectLabel(): string {
  const subject = process.env.NEXT_PUBLIC_PRIMARY_SUBJECT || PRIMARY_SUBJECT;
  return subject.charAt(0).toUpperCase() + subject.slice(1);
}

/**
 * Returns the full brand title, often used in SEO and headers.
 */
export function getBrandTitle(): string {
  return process.env.NEXT_PUBLIC_BRAND_NAME || PUBLIC_BRAND_NAME;
}
