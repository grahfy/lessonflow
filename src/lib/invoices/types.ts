import { InvoiceDiscountKind, InvoiceTaxMode } from "@/generated/prisma/client";

/**
 * Shared discount fields used by presets, invoice lines, and invoice totals.
 *
 * `amount` values are stored in cents. `percent` values are stored in basis
 * points, where `10000` equals `100.00%`.
 */
export type InvoiceDiscountDraft = {
  discountKind?: InvoiceDiscountKind | null;
  discountValue?: number | null;
};

/**
 * Represents a single line item entered by admin before any GST calculations are applied.
 */
export type InvoiceLineItemDraft = InvoiceDiscountDraft & {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxMode: InvoiceTaxMode;
  kind: "lesson_fee" | "educational_books" | "digital_lessons" | "custom";
  sortOrder: number;
  /**
   * Optional link to a LessonPackage. When set, paying the invoice grants the
   * package's prepaid lesson credits to the customer via
   * `grantCreditsForPaidInvoice`. Carried through the calculation engine (which
   * spreads the draft) so it survives into the persisted line item.
   */
  packageId?: string | null;
};

/**
 * Represents a line item after all monetary fields are normalized and calculated.
 */
export type CalculatedInvoiceLineItem = InvoiceLineItemDraft & {
  lineDiscountCents: number;
  lineSubtotalCents: number;
  lineGstCents: number;
  lineTotalCents: number;
};

/**
 * Represents aggregate totals for an invoice, always in integer cents.
 */
export type CalculatedInvoiceTotals = {
  subtotalCents: number;
  discountCents: number;
  gstCents: number;
  totalCents: number;
};

/**
 * Snapshot of customer-facing details that are embedded in the invoice record.
 */
export type InvoiceCustomerSnapshot = {
  customerFirstName: string;
  customerLastName: string;
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
