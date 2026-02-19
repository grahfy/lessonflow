import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { InvoiceTemplateRecord } from "@/lib/invoices/template";

/**
 * Formats integer cents into compact AUD display text for PDF rendering.
 */
function aud(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(cents / 100);
}

/**
 * Creates an invoice PDF as a binary buffer for download and email attachment.
 */
export async function renderInvoicePdf(invoice: InvoiceTemplateRecord): Promise<Buffer> {
  const document = await PDFDocument.create();
  const page = document.addPage([595.28, 841.89]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const left = 40;

  const drawLine = (text: string, options?: { bold?: boolean; size?: number }) => {
    page.drawText(text, {
      x: left,
      y,
      size: options?.size ?? 11,
      font: options?.bold ? boldFont : font,
      color: rgb(0.07, 0.1, 0.16)
    });
    y -= (options?.size ?? 11) + 5;
  };

  drawLine(invoice.documentType === "credit_note" ? "Credit Note" : "Tax Invoice", { bold: true, size: 18 });
  drawLine(invoice.sellerBusinessName, { bold: true });
  drawLine(`ABN: ${invoice.sellerAbn || "Not provided"}`);
  if (invoice.sellerEmail) {
    drawLine(`Email: ${invoice.sellerEmail}`);
  }
  y -= 4;
  drawLine(`${invoice.documentType === "credit_note" ? "Credit Note" : "Invoice"} #: ${invoice.invoiceNumber}`, { bold: true });
  drawLine(`Issued: ${invoice.issuedAt.toISOString().slice(0, 10)}`);
  drawLine(`Due: ${invoice.dueAt.toISOString().slice(0, 10)}`);
  drawLine(`Status: ${invoice.status}`);

  y -= 10;
  drawLine("Bill To", { bold: true });
  drawLine(invoice.customerName);
  drawLine(invoice.customerEmail);
  drawLine(invoice.customerPhone);
  drawLine(invoice.customerAddress);

  y -= 10;
  drawLine("Line Items", { bold: true });
  for (const lineItem of invoice.lineItems.sort((a, b) => a.sortOrder - b.sortOrder)) {
    drawLine(`${lineItem.description} | Qty ${lineItem.quantity} | ${aud(lineItem.lineTotalCents)} | ${lineItem.taxMode}`);
  }

  y -= 10;
  drawLine(`Subtotal: ${aud(invoice.subtotalCents)}`);
  drawLine(`GST: ${aud(invoice.gstCents)}`);
  drawLine(`Total: ${aud(invoice.totalCents)}`, { bold: true });

  y -= 10;
  drawLine("Payment Details", { bold: true });
  drawLine(`Bank: ${invoice.bankName}`);
  drawLine(`BSB: ${invoice.bankBsb}`);
  drawLine(`Account Name: ${invoice.bankAccountName}`);
  drawLine(`Account Number: ${invoice.bankAccountNumber}`);

  if (invoice.notes) {
    y -= 10;
    drawLine("Notes", { bold: true });
    drawLine(invoice.notes);
  }

  const bytes = await document.save();
  return Buffer.from(bytes);
}
