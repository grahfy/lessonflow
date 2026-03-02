import { InvoiceTaxMode } from "@/generated/prisma/client";

/**
 * Represents a single line item entered by admin before any GST calculations are applied.
 */
export type InvoiceLineItemDraft = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxMode: InvoiceTaxMode;
  kind: "lesson_fee" | "educational_books" | "digital_guitar_lessons" | "custom";
  sortOrder: number;
};

/**
 * Represents a line item after all monetary fields are normalized and calculated.
 */
export type CalculatedInvoiceLineItem = InvoiceLineItemDraft & {
  lineSubtotalCents: number;
  lineGstCents: number;
  lineTotalCents: number;
};

/**
 * Represents aggregate totals for an invoice, always in integer cents.
 */
export type CalculatedInvoiceTotals = {
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
};

/**
 * Snapshot of customer-facing details that are embedded in the invoice record.
 */
export type InvoiceCustomerSnapshot = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
};

/**
 * Snapshot of seller and banking details embedded in each invoice record.
 */
export type InvoiceSellerSnapshot = {
  sellerBusinessName: string;
  sellerAbn: string;
  sellerEmail: string | null;
  bankName: string;
  bankBsb: string;
  bankAccountName: string;
  bankAccountNumber: string;
};
