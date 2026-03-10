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
import { renderEmailLayout, getEmailBranding } from "./layout";

/**
 * Renders an email by merging DB content with hardcoded fallbacks and global branding.
 * 
 * LOGIC:
 * 1. Atempts to find a template in the `EmailTemplate` table by its unique key.
 * 2. Merges school branding tokens into the dynamic placeholder context.
 * 3. Interpolates strings like "Hello {{student_name}}" using the context.
 * 4. Wraps the result in the standard school-branded HTML layout.
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
  
  // STEP 1: Fetch runtime template from DB
  const dbTemplate = await prisma.emailTemplate.findUnique({
    where: { templateKey }
  });

  // STEP 2: Prepare global branding context
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
    // Perform placeholder replacement on BOTH subject and body
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

  // STEP 3: Fallback to hardcoded template if DB record is missing
  // RATIONALE: Ensures business continuity even if an admin deletes a template record.
  return fallbackRenderer(globalContext);
}
