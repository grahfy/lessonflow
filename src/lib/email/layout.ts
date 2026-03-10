import { 
  PUBLIC_BRAND_NAME, 
  CONTACT_PHONE, 
  CONTACT_ADDRESS, 
  LOGO_URL 
} from "@/lib/branding";
import { getPublicSiteUrl, getOwnerEmail } from "@/lib/env";

/**
 * Escapes user-provided values before inserting into HTML email strings.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Escapes user-provided text and preserves line breaks for display in HTML.
 */
export function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br/>");
}

/**
 * Resolves branding/signature values with env overrides for deployment-specific contact details.
 */
export function getEmailBranding() {
  const siteUrl = getPublicSiteUrl().replace(/\/+$/, "");
  return {
    brandName: PUBLIC_BRAND_NAME,
    siteUrl,
    phone: CONTACT_PHONE,
    email: process.env.CONTACT_EMAIL || getOwnerEmail(),
    address: CONTACT_ADDRESS,
    logoUrl: LOGO_URL.startsWith("http") ? LOGO_URL : `${siteUrl}${LOGO_URL}`
  };
}

/**
 * Shared signature block appended to all branded emails.
 */
export function renderSignatureHtml() {
  const branding = getEmailBranding();
  return `
    <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e3e8f3;">
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;padding:0 0 12px;">
            <img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.brandName)}" width="164" style="display:block;width:164px;max-width:100%;height:auto;border:0;" />
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#16233d;"><strong>${escapeHtml(branding.brandName)}</strong></p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#41506f;">
        Call or text: <a href="tel:${escapeHtml(branding.phone.replace(/\s+/g, ""))}" style="color:#2247d8;text-decoration:none;">${escapeHtml(branding.phone)}</a><br/>
        Email: <a href="mailto:${escapeHtml(branding.email)}" style="color:#2247d8;text-decoration:none;">${escapeHtml(branding.email)}</a><br/>
        Website: <a href="${escapeHtml(branding.siteUrl)}" style="color:#2247d8;text-decoration:none;">${escapeHtml(branding.siteUrl.replace(/^https?:\/\//, ""))}</a><br/>
        Studio: ${escapeHtml(branding.address)}
      </p>
    </div>
  `;
}

/**
 * Shared email chrome wrapper (card layout + preview text + branding signature).
 *
 * Individual templates only provide the subject/body content so branding and styling changes
 * remain centralized.
 */
export function renderEmailLayout(input: {
  title: string;
  previewText?: string;
  leadHtml?: string;
  contentHtml: string;
}) {
  const branding = getEmailBranding();
  const previewText = input.previewText || input.title;

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(input.title)}</title>
      </head>
      <body style="margin:0;padding:0;background:#f4f7fb;color:#10203a;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
        <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
          ${escapeHtml(previewText)}
        </span>
        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#f4f7fb;">
          <tr>
            <td align="center" style="padding:24px 12px;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 10px 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6d7c98;">
                    ${escapeHtml(branding.brandName)}
                  </td>
                </tr>
                <tr>
                  <td style="background:#ffffff;border:1px solid #dfe6f2;border-radius:14px;padding:24px 22px;box-shadow:0 8px 24px rgba(14,23,43,0.06);">
                    <h2 style="margin:0 0 12px;font-size:22px;line-height:1.2;color:#0f1f3a;">${escapeHtml(input.title)}</h2>
                    ${input.leadHtml ? `<div style=\"margin:0 0 14px;font-size:14px;line-height:1.6;color:#41506f;\">${input.leadHtml}</div>` : ""}
                    <div style="font-size:14px;line-height:1.65;color:#16233d;">
                      ${input.contentHtml}
                    </div>
                    ${renderSignatureHtml()}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}
