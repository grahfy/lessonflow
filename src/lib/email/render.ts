import { prisma } from "@/lib/db";
import { interpolatePlaceholders, PlaceholderContext } from "@/lib/email/placeholders";
import { renderEmailLayout, getEmailBranding } from "./layout";

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
  const branding = getEmailBranding();
  const globalContext: PlaceholderContext = {
    brandName: branding.brandName,
    contactPhone: branding.phone,
    contactAddress: branding.address,
    siteUrl: branding.siteUrl,
    logoUrl: branding.logoUrl,
    ...context
  };

  if (dbTemplate) {
    const subject = interpolatePlaceholders(dbTemplate.subject, globalContext);
    const bodyHtml = interpolatePlaceholders(dbTemplate.htmlBody, globalContext);

    return {
      subject,
      html: renderEmailLayout({
        title: subject,
        contentHtml: bodyHtml
      })
    };
  }

  // 3. Fallback to hardcoded template
  return fallbackRenderer(globalContext);
}
