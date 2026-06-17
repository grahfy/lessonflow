"use client";

import { useCallback, useState } from "react";

import { parseMoneyInputToCents } from "@/lib/invoices/currency";
import { toDateTimeLocalValue, toMoneyInput } from "@/lib/admin/formatters";
import { calculateInvoiceTotals } from "@/lib/invoices/calculate";
import { describeGroupedLessonLine } from "@/lib/invoices/booking-links";
import { getDefaultInvoiceTaxModeForCurrencyValue } from "@/lib/invoices/gst-policy";
import { getInvoiceCurrency } from "@/lib/invoices/tax-profile";
import {
  type InvoiceDiscountKind,
  type InvoiceRow
} from "@/lib/admin/use-invoices";
import { type Preset } from "@/lib/admin/use-presets";
import { type LessonPackage } from "@/lib/admin/use-packages";
import { type InvoiceLineItemDraft } from "@/lib/invoices/types";
import {
  parseDiscountValueForCurrency,
  toDiscountValueInput,
  type EditableLineItem
} from "@/lib/invoices/invoice-display-helpers";

export interface UseInvoiceDetailFormOptions {
  defaultCurrency: string;
  /** Active lesson durations keyed by minutes, used to price quick-lesson line items. */
  activeLessonPricingMap: Map<number, { priceCents: number }>;
  presets: Preset[];
  /** Active lesson packages selectable as credit-granting invoice lines. */
  packages: LessonPackage[];
  onError: (message: string) => void;
}

/**
 * Owns the editable state for the invoice detail dialog.
 *
 * RATIONALE: The dialog maintains its own mutable copy of notes, names, due
 * date, and line items so admins can make local edits without immediately
 * mutating the list row state underneath. Centralizing the state and the line
 * item mutators keeps the orchestrator focused on cross-dialog coordination.
 */
export function useInvoiceDetailForm({
  defaultCurrency,
  activeLessonPricingMap,
  presets,
  packages,
  onError
}: UseInvoiceDetailFormOptions) {
  const [editingNotes, setEditingNotes] = useState("");
  const [editingDueAt, setEditingDueAt] = useState("");
  const [editingLineItems, setEditingLineItems] = useState<EditableLineItem[]>([]);
  const [editingDiscountKind, setEditingDiscountKind] = useState<InvoiceDiscountKind | null>(null);
  const [editingDiscountValueInput, setEditingDiscountValueInput] = useState("");
  const [editingCurrency, setEditingCurrency] = useState(getInvoiceCurrency(defaultCurrency));
  const [editingQuickLessonDurationMinutes, setEditingQuickLessonDurationMinutes] = useState("");
  const [editingProductPresetId, setEditingProductPresetId] = useState("");
  const [editingPackageId, setEditingPackageId] = useState("");
  const [editingCustomerFirstName, setEditingCustomerFirstName] = useState("");
  const [editingCustomerLastName, setEditingCustomerLastName] = useState("");
  const [editingPaymentDetailsSource, setEditingPaymentDetailsSource] = useState<InvoiceRow["paymentDetailsSource"]>("system");
  const [editingBankName, setEditingBankName] = useState("");
  const [editingBankBsb, setEditingBankBsb] = useState("");
  const [editingBankAccountName, setEditingBankAccountName] = useState("");
  const [editingBankAccountNumber, setEditingBankAccountNumber] = useState("");

  const resolvedEditingCurrency = getInvoiceCurrency(editingCurrency);

  /** Hydrates the editable fields from the selected invoice row. */
  const hydrateFromInvoice = useCallback((invoice: InvoiceRow) => {
    setEditingNotes(invoice.notes || "");
    setEditingDueAt(toDateTimeLocalValue(invoice.dueAt));
    setEditingDiscountKind(invoice.discountKind ?? null);
    setEditingDiscountValueInput(toDiscountValueInput(invoice.discountKind ?? null, invoice.discountValue ?? null));
    setEditingCurrency(getInvoiceCurrency(invoice.currency));
    setEditingCustomerFirstName(invoice.customerFirstName || invoice.customerName.split(' ')[0]);
    setEditingCustomerLastName(invoice.customerLastName || invoice.customerName.split(' ').slice(1).join(' '));
    setEditingPaymentDetailsSource(invoice.paymentDetailsSource);
    setEditingBankName(invoice.bankName || "");
    setEditingBankBsb(invoice.bankBsb || "");
    setEditingBankAccountName(invoice.bankAccountName || "");
    setEditingBankAccountNumber(invoice.bankAccountNumber || "");
    setEditingLineItems(
      invoice.lineItems.map((li) => ({
        key: li.id,
        id: li.id,
        kind: li.kind as InvoiceLineItemDraft["kind"],
        description: li.description,
        quantity: String(li.quantity),
        quantityLocked: false,
        unitPriceInput: toMoneyInput(li.unitPriceCents),
        taxMode: li.taxMode,
        discountKind: li.discountKind ?? null,
        discountValueInput: toDiscountValueInput(li.discountKind ?? null, li.discountValue ?? null),
        packageId: li.packageId ?? null
      }))
    );
    setEditingQuickLessonDurationMinutes("");
    setEditingProductPresetId("");
    setEditingPackageId("");
  }, []);

  const resetTransientFields = useCallback(() => {
    setEditingQuickLessonDurationMinutes("");
  }, []);

  const addLineItem = () => {
    setEditingLineItems((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        kind: "custom",
        description: "",
        quantity: "1",
        quantityLocked: false,
        unitPriceInput: "0.00",
        taxMode: getDefaultInvoiceTaxModeForCurrencyValue(resolvedEditingCurrency),
        discountKind: null,
        discountValueInput: ""
      }
    ]);
  };

  const addPresetToInvoice = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setEditingLineItems((prev) => [
      ...prev,
      {
        key: `preset-${preset.id}-${Date.now()}`,
        kind: "custom",
        description: preset.description,
        quantity: "1",
        quantityLocked: true,
        unitPriceInput: toMoneyInput(preset.unitPriceCents),
        taxMode: getDefaultInvoiceTaxModeForCurrencyValue(resolvedEditingCurrency),
        discountKind: preset.discountKind ?? null,
        discountValueInput: toDiscountValueInput(preset.discountKind ?? null, preset.discountValue ?? null),
        isPreset: true
      }
    ]);
    setEditingProductPresetId("");
  };

  const addPackageToInvoice = (packageId: string) => {
    const pkg = packages.find((p) => p.id === packageId);
    if (!pkg) return;
    setEditingLineItems((prev) => [
      ...prev,
      {
        key: `package-${pkg.id}-${Date.now()}`,
        kind: "custom",
        description: pkg.label,
        quantity: "1",
        quantityLocked: true,
        unitPriceInput: toMoneyInput(pkg.priceCents),
        taxMode: getDefaultInvoiceTaxModeForCurrencyValue(resolvedEditingCurrency),
        discountKind: null,
        discountValueInput: "",
        // The packageId is what triggers a prepaid lesson-credit grant when this
        // invoice is paid (see grantCreditsForPaidInvoice).
        packageId: pkg.id
      }
    ]);
    setEditingPackageId("");
  };

  const addQuickLessonToInvoice = (rawDurationMinutes: string) => {
    const durationMinutes = Number.parseInt(rawDurationMinutes, 10);
    if (!Number.isInteger(durationMinutes)) {
      return;
    }

    const lessonPrice = activeLessonPricingMap.get(durationMinutes);
    if (!lessonPrice) {
      onError("Selected lesson duration is no longer available in Lesson Info / Prices.");
      setEditingQuickLessonDurationMinutes("");
      return;
    }

    setEditingLineItems((prev) => [
      ...prev,
      {
        key: `quick-lesson-${durationMinutes}-${Date.now()}`,
        kind: "lesson_fee",
        description: describeGroupedLessonLine(durationMinutes, 1),
        quantity: "1",
        quantityLocked: true,
        unitPriceInput: toMoneyInput(lessonPrice.priceCents),
        taxMode: getDefaultInvoiceTaxModeForCurrencyValue(resolvedEditingCurrency),
        discountKind: null,
        discountValueInput: ""
      }
    ]);
    setEditingQuickLessonDurationMinutes("");
  };

  const removeLineItem = (key: string) => {
    setEditingLineItems((prev) => prev.filter((li) => li.key !== key));
  };

  const updateLineItem = (key: string, patch: Partial<EditableLineItem>) => {
    setEditingLineItems((prev) => prev.map((li) => (li.key === key ? { ...li, ...patch } : li)));
  };

  const editingCalculation = calculateInvoiceTotals(
    editingLineItems.map((li, index) => ({
      kind: li.kind,
      description: li.description,
      quantity: li.quantityLocked ? 1 : Number.parseFloat(li.quantity) || 0,
      unitPriceCents: parseMoneyInputToCents(li.unitPriceInput, resolvedEditingCurrency).cents || 0,
      taxMode: li.taxMode,
      sortOrder: index,
      discountKind: li.discountKind,
      discountValue: parseDiscountValueForCurrency(li.discountKind, li.discountValueInput, resolvedEditingCurrency)
    })),
    {
      discountKind: editingDiscountKind,
      discountValue: parseDiscountValueForCurrency(editingDiscountKind, editingDiscountValueInput, resolvedEditingCurrency)
    },
    {
      currency: resolvedEditingCurrency
    }
  );

  return {
    editingNotes,
    setEditingNotes,
    editingDueAt,
    setEditingDueAt,
    editingLineItems,
    editingDiscountKind,
    setEditingDiscountKind,
    editingDiscountValueInput,
    setEditingDiscountValueInput,
    editingCurrency,
    setEditingCurrency,
    editingQuickLessonDurationMinutes,
    setEditingQuickLessonDurationMinutes,
    editingProductPresetId,
    setEditingProductPresetId,
    editingPackageId,
    setEditingPackageId,
    editingCustomerFirstName,
    setEditingCustomerFirstName,
    editingCustomerLastName,
    setEditingCustomerLastName,
    editingPaymentDetailsSource,
    setEditingPaymentDetailsSource,
    editingBankName,
    setEditingBankName,
    editingBankBsb,
    setEditingBankBsb,
    editingBankAccountName,
    setEditingBankAccountName,
    editingBankAccountNumber,
    setEditingBankAccountNumber,
    resolvedEditingCurrency,
    editingCalculation,
    hydrateFromInvoice,
    resetTransientFields,
    addLineItem,
    addPresetToInvoice,
    addPackageToInvoice,
    addQuickLessonToInvoice,
    removeLineItem,
    updateLineItem
  };
}
