import { Invoice, InvoiceLineItem } from "@prisma/client";

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
    timeZone: "Australia/Melbourne"
  }).format(date);
}

/**
 * Formats integer cents as AUD currency.
 */
function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(cents / 100);
}

export type InvoiceTemplateRecord = Invoice & {
  lineItems: InvoiceLineItem[];
};

/**
 * Renders invoice HTML for customer email preview and optional browser print view.
 */
export function renderInvoiceHtml(invoice: InvoiceTemplateRecord): string {
  const heading = invoice.documentType === "credit_note" ? "Credit Note" : "Tax Invoice";
  const statusLabel = invoice.documentType === "credit_note" ? "credit note" : "invoice";
  const rows = invoice.lineItems
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(
      (lineItem) => `
        <tr>
          <td>${escapeHtml(lineItem.description)}</td>
          <td>${lineItem.quantity}</td>
          <td>${formatCurrency(lineItem.unitPriceCents)}</td>
          <td>${lineItem.taxMode === "taxable" ? "GST" : "GST-free"}</td>
          <td>${formatCurrency(lineItem.lineTotalCents)}</td>
        </tr>
      `
    )
    .join("");

  const paidMarker =
    invoice.status === "paid"
      ? `<p style="color:#065f46;font-weight:700;">PAID ${invoice.paidAt ? `on ${formatInvoiceDate(invoice.paidAt)}` : ""}</p>`
      : "";

  return `
    <section style="font-family:Arial,sans-serif; color:#0f172a; max-width:860px; margin:0 auto; padding:16px;">
      <header style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
        <div>
          <img src="${escapeHtml(process.env.NEXT_PUBLIC_SITE_URL || "")}/images/company-logo-invoice.png" alt="Melbourne Guitar School" style="width:200px;height:auto;object-fit:contain;" />
          <h1 style="margin:10px 0 6px;">${heading}</h1>
          <p style="margin:0;"><strong>${escapeHtml(invoice.sellerBusinessName)}</strong></p>
          <p style="margin:0;">ABN: ${escapeHtml(invoice.sellerAbn || "Not provided")}</p>
          <p style="margin:0;">Rear 66/68 High Street</p>
          <p style="margin:0;">Northcote, Victoria 3070</p>
          <p style="margin:0;">Australia</p>
          <p style="margin:0;">Mobile: 0401 489 437</p>
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
        <h2 style="margin:0 0 8px; font-size:1rem;">Bill To</h2>
        <p style="margin:0;"><strong>${escapeHtml(invoice.customerName)}</strong></p>
        <p style="margin:0;">${escapeHtml(invoice.customerEmail)}</p>
        <p style="margin:0;">${escapeHtml(invoice.customerPhone)}</p>
        <p style="margin:0;">${escapeHtml(invoice.customerAddress)}</p>
      </section>

      <table style="width:100%; border-collapse:collapse; margin-top:16px;">
        <thead>
          <tr>
            <th style="text-align:left; border-bottom:1px solid #cbd5e1; padding:8px;">Description</th>
            <th style="text-align:left; border-bottom:1px solid #cbd5e1; padding:8px;">Qty</th>
            <th style="text-align:left; border-bottom:1px solid #cbd5e1; padding:8px;">Unit</th>
            <th style="text-align:left; border-bottom:1px solid #cbd5e1; padding:8px;">Tax</th>
            <th style="text-align:left; border-bottom:1px solid #cbd5e1; padding:8px;">Line Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <section style="margin-top:16px; text-align:right;">
        <p style="margin:2px 0;">Subtotal: ${formatCurrency(invoice.subtotalCents)}</p>
        <p style="margin:2px 0;">GST: ${formatCurrency(invoice.gstCents)}</p>
        <p style="margin:2px 0; font-weight:700;">Total: ${formatCurrency(invoice.totalCents)}</p>
      </section>

      <section style="margin-top:18px; border-top:1px solid #e2e8f0; padding-top:12px;">
        <h2 style="margin:0 0 8px; font-size:1rem;">Payment Details</h2>
        <p style="margin:0;">Bank: ${escapeHtml(invoice.bankName)}</p>
        <p style="margin:0;">BSB: ${escapeHtml(invoice.bankBsb)}</p>
        <p style="margin:0;">Account Name: ${escapeHtml(invoice.bankAccountName)}</p>
        <p style="margin:0;">Account Number: ${escapeHtml(invoice.bankAccountNumber)}</p>
      </section>

      ${invoice.notes ? `<section style="margin-top:14px;"><h2 style="margin:0 0 8px; font-size:1rem;">Notes</h2><p style="margin:0;">${escapeHtml(invoice.notes)}</p></section>` : ""}
    </section>
  `;
}
