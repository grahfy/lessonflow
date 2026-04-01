import { InvoicePaymentDetailsSource } from "@/generated/prisma/client";
import { sellerSnapshotFromEnv } from "@/lib/invoices/snapshots";

export type InvoicePaymentDetails = {
  bankName: string;
  bankBsb: string;
  bankAccountName: string;
  bankAccountNumber: string;
};

type InvoicePaymentDetailsCarrier = InvoicePaymentDetails & {
  paymentDetailsSource: InvoicePaymentDetailsSource;
};

/**
 * Reads the current system-managed invoice payment details from settings/env.
 */
export function getSystemInvoicePaymentDetails(): InvoicePaymentDetails {
  const sellerSnapshot = sellerSnapshotFromEnv();

  return {
    bankName: sellerSnapshot.bankName,
    bankBsb: sellerSnapshot.bankBsb,
    bankAccountName: sellerSnapshot.bankAccountName,
    bankAccountNumber: sellerSnapshot.bankAccountNumber
  };
}

/**
 * Resolves which payment details should be shown for a given invoice record.
 */
export function resolveInvoicePaymentDetails(invoice: InvoicePaymentDetailsCarrier): InvoicePaymentDetails {
  if (invoice.paymentDetailsSource === "system") {
    return getSystemInvoicePaymentDetails();
  }

  return {
    bankName: invoice.bankName,
    bankBsb: invoice.bankBsb,
    bankAccountName: invoice.bankAccountName,
    bankAccountNumber: invoice.bankAccountNumber
  };
}

/**
 * Returns an invoice-like object with effective payment details applied.
 */
export function withResolvedInvoicePaymentDetails<T extends InvoicePaymentDetailsCarrier>(invoice: T): T {
  return {
    ...invoice,
    ...resolveInvoicePaymentDetails(invoice)
  };
}
