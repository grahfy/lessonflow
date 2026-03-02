import { Invoice, InvoiceLineItem } from "@/generated/prisma/client";

import { sendEmail } from "@/lib/email/service";
import { customerInvoiceReminderTemplate, customerInvoiceTemplate } from "@/lib/email/templates";
import { renderInvoicePdf } from "@/lib/invoices/pdf";

export type InvoiceWithLines = Invoice & {
  lineItems: InvoiceLineItem[];
};

/**
 * Sends an invoice email with PDF attachment to the customer.
 */
export async function sendCustomerInvoiceEmail(invoice: InvoiceWithLines): Promise<void> {
  const template = customerInvoiceTemplate({
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    dueAt: invoice.dueAt,
    totalCents: invoice.totalCents,
    sellerBusinessName: invoice.sellerBusinessName
  });

  const pdfBuffer = await renderInvoicePdf(invoice);
  await sendEmail({
    to: invoice.customerEmail,
    subject: template.subject,
    html: template.html,
    attachments: [
      {
        filename: `${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf"
      }
    ]
  });
}

/**
 * Sends an overdue reminder email with the current invoice PDF attached.
 */
export async function sendCustomerInvoiceReminderEmail(invoice: InvoiceWithLines, overdueDays: number): Promise<void> {
  const template = customerInvoiceReminderTemplate({
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    dueAt: invoice.dueAt,
    totalCents: invoice.totalCents,
    sellerBusinessName: invoice.sellerBusinessName,
    overdueDays
  });

  const pdfBuffer = await renderInvoicePdf(invoice);
  await sendEmail({
    to: invoice.customerEmail,
    subject: template.subject,
    html: template.html,
    attachments: [
      {
        filename: `${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf"
      }
    ]
  });
}
