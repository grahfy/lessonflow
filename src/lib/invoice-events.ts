import { Invoice, InvoiceLineItem } from "@/generated/prisma/client";

import { sendEmail, type SendEmailResult } from "@/lib/email/service";
import { type EmailNotificationMetadata } from "@/lib/email/notification-settings";
import { customerInvoiceReminderTemplate, customerInvoiceTemplate } from "@/lib/email/templates";
import { getPublicSiteUrl } from "@/lib/env";
import { ensurePayToken, invoicePayUrl } from "@/lib/invoices/pay-token";
import { withResolvedInvoicePaymentDetails } from "@/lib/invoices/payment-details";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import { logError } from "@/lib/observability";
import { isStripeConfigured } from "@/lib/stripe/client";

export type InvoiceWithLines = Invoice & {
  lineItems: InvoiceLineItem[];
};

/**
 * Resolves the public "Pay online" URL for an invoice, or null when online
 * payment should not be offered. Gated on Stripe being configured and the
 * invoice being in a payable state (sent, not paid/void/deleted).
 *
 * If the invoice is payable but has no pay token yet, one is provisioned here
 * (best-effort). The send route also ensures a token at send time, but the
 * reminder path reaches this function without going through the send route, so
 * ensuring here guarantees a working pay link for any payable invoice —
 * including legacy invoices first sent before online payment existed. A token
 * failure returns null so the email/PDF still goes out without a pay link.
 */
async function resolveInvoicePayUrl(invoice: {
  id: string;
  status: string;
  documentType: string;
  isDeleted: boolean;
  payToken: string | null;
}): Promise<string | null> {
  if (
    !isStripeConfigured() ||
    invoice.isDeleted ||
    invoice.status !== "sent" ||
    invoice.documentType !== "invoice"
  ) {
    return null;
  }
  try {
    const token = invoice.payToken ?? (await ensurePayToken(invoice));
    // Reflect the (possibly newly created) token back onto the in-memory record
    // so a subsequent PDF render — which self-reads invoice.payToken — sees it.
    invoice.payToken = token;
    return invoicePayUrl(getPublicSiteUrl(), token);
  } catch (error) {
    logError("invoice.resolve_pay_url_failed", error, { invoiceId: invoice.id });
    return null;
  }
}

/**
 * Sends an invoice email with PDF attachment to the customer.
 */
export async function sendCustomerInvoiceEmail(invoice: InvoiceWithLines): Promise<SendEmailResult> {
  const resolvedInvoice = withResolvedInvoicePaymentDetails(invoice);
  // Ensure the token (if needed) BEFORE rendering so the attached PDF — which
  // self-reads invoice.payToken — also carries the pay link.
  const payUrl = await resolveInvoicePayUrl(resolvedInvoice);
  const template = customerInvoiceTemplate({
    invoiceNumber: resolvedInvoice.invoiceNumber,
    customerName: resolvedInvoice.customerName,
    dueAt: resolvedInvoice.dueAt,
    totalCents: resolvedInvoice.totalCents,
    sellerBusinessName: resolvedInvoice.sellerBusinessName,
    payUrl
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
  // Ensure the token (if needed) BEFORE rendering so the attached PDF — which
  // self-reads invoice.payToken — also carries the pay link.
  const payUrl = await resolveInvoicePayUrl(resolvedInvoice);
  const template = customerInvoiceReminderTemplate({
    invoiceNumber: resolvedInvoice.invoiceNumber,
    customerName: resolvedInvoice.customerName,
    dueAt: resolvedInvoice.dueAt,
    totalCents: resolvedInvoice.totalCents,
    sellerBusinessName: resolvedInvoice.sellerBusinessName,
    overdueDays,
    payUrl
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
