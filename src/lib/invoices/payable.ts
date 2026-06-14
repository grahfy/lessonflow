/**
 * Single source of truth for "is this invoice payable online right now?".
 *
 * Used by every Stripe pay surface (the public pay page, the public pay POST
 * route, the email/PDF pay-link gating) so the rule can never drift between
 * call sites. An invoice is payable only when it is a real invoice document
 * (not a credit note), is in the "sent" status, and has not been deleted.
 */
export type PayableInvoiceFields = {
  status: string;
  isDeleted: boolean;
  documentType: string;
};

export function isInvoicePayable(
  invoice: PayableInvoiceFields | null | undefined,
): boolean {
  return (
    !!invoice &&
    !invoice.isDeleted &&
    invoice.status === "sent" &&
    invoice.documentType === "invoice"
  );
}
