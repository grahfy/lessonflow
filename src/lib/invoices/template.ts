import { Invoice, InvoiceLineItem, InvoiceTemplate } from "@/generated/prisma/client";
import { 
  PUBLIC_BRAND_NAME, 
  CONTACT_PHONE, 
  CONTACT_ADDRESS, 
  INVOICE_LOGO_URL,
  DEFAULT_CURRENCY
} from "@/lib/branding";
import { APP_TIMEZONE } from "@/lib/time";

/**
 * Escapes arbitrary text for safe HTML rendering.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Formats a date for customer-facing invoice output in Australia locale.
 */
function formatInvoiceDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "long",
    timeZone: APP_TIMEZONE
  }).format(date);
}

/**
 * Formats integer cents as currency.
 */
function formatCurrency(cents: number, currency: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency
  }).format(cents / 100);
}

export type InvoiceTemplateRecord = Invoice & {
  lineItems: InvoiceLineItem[];
};

/**
 * Renders invoice HTML for customer email preview and optional browser print view.
 */
export function renderInvoiceHtml(invoice: InvoiceTemplateRecord, templateConfig?: InvoiceTemplate | null): string {
  const heading = invoice.documentType === "credit_note" ? "Credit Note" : "Tax Invoice";
  const statusLabel = invoice.documentType === "credit_note" ? "credit note" : "invoice";
  const currency = invoice.currency || DEFAULT_CURRENCY;
  const accentColor = templateConfig?.accentColor || "#2247d8";
  const logoUrl = templateConfig?.logoUrl || INVOICE_LOGO_URL;
  const footerText = templateConfig?.footerText || "";
  const headerInfo = templateConfig?.headerInfo || "";

  const rows = invoice.lineItems
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(
      (lineItem) => `
        <tr>
          <td style="padding:8px; border-bottom:1px solid #edf2f7;">${escapeHtml(lineItem.description)}</td>
          <td style="padding:8px; border-bottom:1px solid #edf2f7;">${lineItem.quantity}</td>
          <td style="padding:8px; border-bottom:1px solid #edf2f7;">${formatCurrency(lineItem.unitPriceCents, currency)}</td>
          <td style="padding:8px; border-bottom:1px solid #edf2f7;">${lineItem.taxMode === "taxable" ? "GST" : "GST-free"}</td>
          <td style="padding:8px; border-bottom:1px solid #edf2f7;">${formatCurrency(lineItem.lineTotalCents, currency)}</td>
        </tr>
      `
    )
    .join("");

  const paidMarker =
    invoice.status === "paid"
      ? `<p style="color:#065f46;font-weight:700;">PAID ${invoice.paidAt ? `on ${formatInvoiceDate(invoice.paidAt)}` : ""}</p>`
      : "";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const fullLogoUrl = logoUrl.startsWith("http") ? logoUrl : `${siteUrl}${logoUrl}`;

  return `
    <section style="font-family:Arial,sans-serif; color:#0f172a; max-width:860px; margin:0 auto; padding:16px;">
      <header style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
        <div>
          <img src="${escapeHtml(fullLogoUrl)}" alt="${escapeHtml(PUBLIC_BRAND_NAME)}" style="width:200px;height:auto;object-fit:contain;" />
          <h1 style="margin:10px 0 6px; color:${accentColor};">${heading}</h1>
          <p style="margin:0;"><strong>${escapeHtml(invoice.sellerBusinessName)}</strong></p>
          <p style="margin:0;">ABN: ${escapeHtml(invoice.sellerAbn || "Not provided")}</p>
          ${headerInfo ? `<div style="margin-top:4px; font-size:0.9rem; color:#475569;">${headerInfo.split('\n').map(line => `<p style="margin:0;">${escapeHtml(line)}</p>`).join('')}</div>` : `
            <p style="margin:0;">${escapeHtml(CONTACT_ADDRESS)}</p>
            <p style="margin:0;">Australia</p>
            <p style="margin:0;">Mobile: ${escapeHtml(CONTACT_PHONE)}</p>
          `}
          ${invoice.sellerEmail ? `<p style="margin:0;">Email: ${escapeHtml(invoice.sellerEmail)}</p>` : ""}
        </div>
        <div style="text-align:right;">
          <p style="margin:0;"><strong>${escapeHtml(statusLabel)} #${escapeHtml(invoice.invoiceNumber)}</strong></p>
          <p style="margin:0;">Issued: ${formatInvoiceDate(invoice.issuedAt)}</p>
          <p style="margin:0;">Due: ${formatInvoiceDate(invoice.dueAt)}</p>
          <p style="margin:0;">Status: ${escapeHtml(invoice.status)}</p>
          ${paidMarker}
        </div>
      </header>

      <section style="margin-top:18px; border-top:1px solid #e2e8f0; padding-top:12px;">
        <h2 style="margin:0 0 8px; font-size:1rem; color:${accentColor};">Bill To</h2>
        <p style="margin:0;"><strong>${escapeHtml(invoice.customerName)}</strong></p>
        <p style="margin:0;">${escapeHtml(invoice.customerEmail)}</p>
        <p style="margin:0;">${escapeHtml(invoice.customerPhone)}</p>
        <p style="margin:0;">${escapeHtml(invoice.customerAddress)}</p>
      </section>

      <table style="width:100%; border-collapse:collapse; margin-top:16px;">
        <thead>
          <tr style="background-color:#f8fafc;">
            <th style="text-align:left; border-bottom:2px solid ${accentColor}; padding:8px;">Description</th>
            <th style="text-align:left; border-bottom:2px solid ${accentColor}; padding:8px;">Qty</th>
            <th style="text-align:left; border-bottom:2px solid ${accentColor}; padding:8px;">Unit</th>
            <th style="text-align:left; border-bottom:2px solid ${accentColor}; padding:8px;">Tax</th>
            <th style="text-align:left; border-bottom:2px solid ${accentColor}; padding:8px;">Line Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <section style="margin-top:16px; text-align:right;">
        <p style="margin:2px 0;">Subtotal: ${formatCurrency(invoice.subtotalCents, currency)}</p>
        <p style="margin:2px 0;">GST: ${formatCurrency(invoice.gstCents, currency)}</p>
        <p style="margin:2px 0; font-weight:700; color:${accentColor}; font-size:1.1rem;">Total: ${formatCurrency(invoice.totalCents, currency)}</p>
      </section>

      <section style="margin-top:18px; border-top:1px solid #e2e8f0; padding-top:12px;">
        <h2 style="margin:0 0 8px; font-size:1rem; color:${accentColor};">Payment Details</h2>
        <p style="margin:0;">Bank: ${escapeHtml(invoice.bankName)}</p>
        <p style="margin:0;">BSB: ${escapeHtml(invoice.bankBsb)}</p>
        <p style="margin:0;">Account Name: ${escapeHtml(invoice.bankAccountName)}</p>
        <p style="margin:0;">Account Number: ${escapeHtml(invoice.bankAccountNumber)}</p>
      </section>

      ${invoice.notes ? `<section style="margin-top:14px;"><h2 style="margin:0 0 8px; font-size:1rem; color:${accentColor};">Notes</h2><p style="margin:0;">${escapeHtml(invoice.notes)}</p></section>` : ""}
      
      ${footerText ? `<footer style="margin-top:24px; padding-top:12px; border-top:1px solid #e2e8f0; font-size:0.8rem; color:#64748b; text-align:center;">${escapeHtml(footerText)}</footer>` : ""}
    </section>
  `;
}
