import {
  basisPointsToPercentageInput,
  formatCurrency,
  parseMoneyInputToCents,
  parsePercentageInputToBasisPoints
} from "@/lib/invoices/currency";
import { toMoneyInput } from "@/lib/admin/formatters";
import {
  type InvoiceDiscountKind,
  type InvoiceRow,
  type InvoiceTaxMode
} from "@/lib/admin/use-invoices";
import { type InvoiceLineItemDraft } from "@/lib/invoices/types";

export type EditableLineItem = {
  key: string;
  id?: string;
  kind: InvoiceLineItemDraft["kind"];
  description: string;
  quantity: string;
  quantityLocked?: boolean;
  unitPriceInput: string;
  taxMode: InvoiceTaxMode;
  discountKind: InvoiceDiscountKind | null;
  discountValueInput: string;
  isPreset?: boolean;
};

export type InvoiceDisplayStatus = InvoiceRow["status"] | "overdue";
export type InvoiceBookingIneligibilityReason = "already_invoiced" | "missing_lesson_price" | "invalid_status";
export type CreateLessonSourceMode = "single_booking" | "single_quick" | "multiple_bookings";
export type CreateSupplementalSource = "custom" | "presets";
export type CreateStandaloneItemDraft = {
  key: string;
  description: string;
  unitPriceInput: string;
};

export type CustomerInvoiceBookingOption = {
  id: string;
  status: "approved" | "cancelled";
  startAt: string;
  lessonMode: "in_person" | "video";
  lessonDuration: "min30" | "min60";
  customDurationMinutes: number | null;
  durationMinutes: number;
  linkedInvoiceId: string | null;
  isInvoiceSelectable: boolean;
  invoiceIneligibilityReason: InvoiceBookingIneligibilityReason | null;
};

/**
 * Promotes sufficiently overdue unpaid invoices into a dedicated display state
 * without mutating the persisted invoice lifecycle value.
 */
export function getDisplayStatus(invoice: InvoiceRow, overdueOnly: boolean): InvoiceDisplayStatus {
  if (
    overdueOnly &&
    invoice.overdueDays !== null &&
    invoice.overdueDays > 1 &&
    invoice.status !== "paid" &&
    invoice.status !== "void"
  ) {
    return "overdue";
  }
  return invoice.status;
}

/** Formats stored cent values for display in the invoices console. */
export function toCurrency(cents: number, currency: string) {
  return formatCurrency(cents, currency);
}

/**
 * Renders how a paid invoice was settled. Legacy rows predating the paidVia column
 * (null) were only ever settled manually, so they fall back to "Manually".
 */
export function formatPaidVia(paidVia: InvoiceRow["paidVia"]): string {
  return paidVia === "stripe" ? "Online (Stripe)" : "Manually";
}

export function toDiscountValueInput(kind: InvoiceDiscountKind | null, value: number | null): string {
  if (!kind || value === null) {
    return "";
  }

  return kind === "percent" ? basisPointsToPercentageInput(value) : toMoneyInput(value);
}

export function parseDiscountValueForCurrency(kind: InvoiceDiscountKind | null, rawInput: string, currency: string): number | null {
  if (!kind) {
    return null;
  }

  return kind === "percent"
    ? parsePercentageInputToBasisPoints(rawInput).basisPoints
    : parseMoneyInputToCents(rawInput, currency).cents;
}

export function describeDiscount(kind: InvoiceDiscountKind | null, value: number | null, currency: string): string {
  if (!kind || value === null) {
    return "No discount";
  }

  return kind === "percent" ? `${basisPointsToPercentageInput(value)}%` : toCurrency(value, currency);
}

export function describeBookingIneligibility(reason: InvoiceBookingIneligibilityReason | null): string {
  if (reason === "already_invoiced") {
    return "Already invoiced";
  }
  if (reason === "missing_lesson_price") {
    return "Missing lesson price";
  }
  if (reason === "invalid_status") {
    return "Only approved bookings can be invoiced";
  }
  return "";
}

export function makeCreateStandaloneItemDraft(): CreateStandaloneItemDraft {
  return {
    key: `standalone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: "",
    unitPriceInput: "0.00"
  };
}
