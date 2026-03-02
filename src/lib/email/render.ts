import { prisma } from "@/lib/db";
import { interpolatePlaceholders, PlaceholderContext } from "@/lib/email/placeholders";
import { PUBLIC_BRAND_NAME, CONTACT_PHONE, CONTACT_ADDRESS, LOGO_URL } from "@/lib/branding";
import { getPublicSiteUrl } from "@/lib/env";

/**
 * Renders an email template by key, merging DB content with hardcoded fallbacks.
 * 
 * @param templateKey - The unique key identifying the template
 * @param context - Dynamic data for placeholders
 * @param fallbackRenderer - Function returning {subject, html} if DB template is missing
 */
export async function renderTemplate(
  templateKey: string,
  context: PlaceholderContext,
  fallbackRenderer: (ctx: PlaceholderContext) => { subject: string; html: string }
): Promise<{ subject: string; html: string }> {
  
  // 1. Fetch template from DB
  const dbTemplate = await prisma.emailTemplate.findUnique({
    where: { templateKey }
  });

  // 2. Prepare global branding context
  const siteUrl = getPublicSiteUrl().replace(/\/+$/, "");
  const globalContext: PlaceholderContext = {
    brandName: PUBLIC_BRAND_NAME,
    contactPhone: CONTACT_PHONE,
    contactAddress: CONTACT_ADDRESS,
    siteUrl,
    logoUrl: LOGO_URL,
    ...context
  };

  if (dbTemplate) {
    return {
      subject: interpolatePlaceholders(dbTemplate.subject, globalContext),
      html: interpolatePlaceholders(dbTemplate.htmlBody, globalContext)
    };
  }

  // 3. Fallback to hardcoded template
  return fallbackRenderer(globalContext);
}
