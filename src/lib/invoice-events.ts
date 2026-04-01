import { Invoice, InvoiceLineItem } from "@/generated/prisma/client";

import { sendEmail, type SendEmailResult } from "@/lib/email/service";
import { type EmailNotificationMetadata } from "@/lib/email/notification-settings";
import { customerInvoiceReminderTemplate, customerInvoiceTemplate } from "@/lib/email/templates";
import { withResolvedInvoicePaymentDetails } from "@/lib/invoices/payment-details";
import { renderInvoicePdf } from "@/lib/invoices/pdf";

export type InvoiceWithLines = Invoice & {
  lineItems: InvoiceLineItem[];
};

/**
 * Sends an invoice email with PDF attachment to the customer.
 */
export async function sendCustomerInvoiceEmail(invoice: InvoiceWithLines): Promise<SendEmailResult> {
  const resolvedInvoice = withResolvedInvoicePaymentDetails(invoice);
  const template = customerInvoiceTemplate({
    invoiceNumber: resolvedInvoice.invoiceNumber,
    customerName: resolvedInvoice.customerName,
    dueAt: resolvedInvoice.dueAt,
    totalCents: resolvedInvoice.totalCents,
    sellerBusinessName: resolvedInvoice.sellerBusinessName
  });

  const pdfBuffer = await renderInvoicePdf(resolvedInvoice);
  return sendEmail({
    to: resolvedInvoice.customerEmail,
    subject: template.subject,
    html: template.html,
    notification: {
      triggerMode: "manual"
    },
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
export async function sendCustomerInvoiceReminderEmail(
  invoice: InvoiceWithLines,
  overdueDays: number,
  options?: {
    notification?: EmailNotificationMetadata;
    skipNotificationPolicyCheck?: boolean;
  }
): Promise<SendEmailResult> {
  const resolvedInvoice = withResolvedInvoicePaymentDetails(invoice);
  const template = customerInvoiceReminderTemplate({
    invoiceNumber: resolvedInvoice.invoiceNumber,
    customerName: resolvedInvoice.customerName,
    dueAt: resolvedInvoice.dueAt,
    totalCents: resolvedInvoice.totalCents,
    sellerBusinessName: resolvedInvoice.sellerBusinessName,
    overdueDays
  });

  const pdfBuffer = await renderInvoicePdf(resolvedInvoice);
  return sendEmail({
    to: resolvedInvoice.customerEmail,
    subject: template.subject,
    html: template.html,
    notification: options?.notification ?? {
      triggerMode: "manual"
    },
    skipNotificationPolicyCheck: options?.skipNotificationPolicyCheck,
    attachments: [
      {
        filename: `${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf"
      }
    ]
  });
}
