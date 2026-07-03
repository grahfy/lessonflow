/**
 * Email Template Renderer
 * 
 * Orchestrates the assembly of transactional emails by merging dynamic data 
 * into stored templates and wrapping them in a standard HTML layout.
 * 
 * DESIGN RATIONALE:
 * 1. Database-First Configuration: Admins can modify email copy (subjects/bodies) 
 *    directly in the DB via the /admin/settings UI without code deploys.
 * 2. Hardcoded Fallbacks: To prevent system failure if a DB row is deleted or 
 *    not yet seeded, the renderer requires a `fallbackRenderer` function.
 * 3. Consistent Branding: Automatically injects global branding (School Name, 
 *    Phone, Address, Logo) into the rendering context for every email.
 * 4. Standardized Layout: Wraps every template body in a consistent HTML 
 *    shell (header/footer) defined in `layout.ts`.
 */

import { prisma } from "@/lib/db";
import { interpolatePlaceholders, PlaceholderContext } from "@/lib/email/placeholders";
import { renderEmailLayout, buildEmailBranding } from "./layout";

/**
 * Renders an email by merging DB content with hardcoded fallbacks and global branding.
 *
 * @param templateKey - Identifier for the template (e.g., 'invoice_sent')
 * @param context - Dynamic data for the specific email instance
 * @param fallbackRenderer - Function providing default copy if DB row is missing
 * @returns Object with the final subject and fully rendered HTML body
 */
export async function renderTemplate(
  templateKey: string,
  context: PlaceholderContext,
  fallbackRenderer: (ctx: PlaceholderContext) => { subject: string; html: string }
): Promise<{ subject: string; html: string }> {
  const dbTemplate = await prisma.emailTemplate.findUnique({
    where: { templateKey }
  });

  const branding = buildEmailBranding();
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

  // Fallback to hardcoded template if DB record is missing, ensuring business
  // continuity even if an admin deletes a template record.
  return fallbackRenderer(globalContext);
}
