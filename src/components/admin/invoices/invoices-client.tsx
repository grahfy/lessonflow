"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CalendarDays } from "lucide-react";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminTable, AdminTableSeparator as Separator } from "@/components/admin/ui/admin-table";
import { AppDialog } from "@/components/ui/app-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { useTweenOrchestrator } from "@/components/motion/tween-orchestrator";
import { basisPointsToPercentageInput, formatCurrency, parseMoneyInputToCents, parsePercentageInputToBasisPoints } from "@/lib/invoices/currency";
import { formatDateTime, toDateTimeLocalValue, toMoneyInput } from "@/lib/admin/formatters";
import { dateTimeLocalToIso } from "@/lib/time";

import { useLessonPricing } from "@/lib/admin/use-lesson-pricing";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import {
  useInvoices,
  type InvoiceAction,
  type InvoiceDiscountKind,
  type InvoiceRow,
  type InvoiceTaxMode
} from "@/lib/admin/use-invoices";
import { usePresets } from "@/lib/admin/use-presets";
import { useCustomers } from "@/lib/admin/use-customers";
import { calculateInvoiceTotals } from "@/lib/invoices/calculate";
import { describeGroupedLessonLine } from "@/lib/invoices/booking-links";
import { getDefaultInvoiceTaxModeForCurrencyValue, getInvoiceTaxName } from "@/lib/invoices/gst-policy";
import { type InvoiceSortBy, type InvoiceSortDirection } from "@/lib/invoices/schema";
import { getInvoiceCurrency } from "@/lib/invoices/tax-profile";
import { canApplyInvoiceAction } from "@/lib/invoices/transitions";
import { type InvoiceLineItemDraft } from "@/lib/invoices/types";

type EditableLineItem = {
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

type InvoiceDisplayStatus = InvoiceRow["status"] | "overdue";
type InvoiceBookingIneligibilityReason = "already_invoiced" | "missing_lesson_price" | "invalid_status";
type CreateLessonSourceMode = "single_booking" | "single_quick" | "multiple_bookings";
type CreateSupplementalSource = "custom" | "presets";
type CreateStandaloneItemDraft = {
  key: string;
  description: string;
  unitPriceInput: string;
};

type CustomerInvoiceBookingOption = {
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
function getDisplayStatus(invoice: InvoiceRow, overdueOnly: boolean): InvoiceDisplayStatus {
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
function toCurrency(cents: number, currency: string) {
  return formatCurrency(cents, currency);
}

/**
 * Renders how a paid invoice was settled. Legacy rows predating the paidVia column
 * (null) were only ever settled manually, so they fall back to "Manually".
 */
function formatPaidVia(paidVia: InvoiceRow["paidVia"]): string {
  return paidVia === "stripe" ? "Online (Stripe)" : "Manually";
}

function toDiscountValueInput(kind: InvoiceDiscountKind | null, value: number | null): string {
  if (!kind || value === null) {
    return "";
  }

  return kind === "percent" ? basisPointsToPercentageInput(value) : toMoneyInput(value);
}

function parseDiscountValueForCurrency(kind: InvoiceDiscountKind | null, rawInput: string, currency: string): number | null {
  if (!kind) {
    return null;
  }

  return kind === "percent"
    ? parsePercentageInputToBasisPoints(rawInput).basisPoints
    : parseMoneyInputToCents(rawInput, currency).cents;
}

function describeDiscount(kind: InvoiceDiscountKind | null, value: number | null, currency: string): string {
  if (!kind || value === null) {
    return "No discount";
  }

  return kind === "percent" ? `${basisPointsToPercentageInput(value)}%` : toCurrency(value, currency);
}

function describeBookingIneligibility(reason: InvoiceBookingIneligibilityReason | null): string {
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

function makeCreateStandaloneItemDraft(): CreateStandaloneItemDraft {
  return {
    key: `standalone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: "",
    unitPriceInput: "0.00"
  };
}

/**
 * Admin invoices console client.
 *
 * RATIONALE: This screen coordinates list state, deep-linkable dialog opens,
 * draft creation, lifecycle actions, and customer handoff transitions. The
 * hooks keep API details centralized, while the page owns the cross-dialog
 * state that determines what admins see next.
 */
export function AdminInvoicesClient({ defaultCurrency }: { defaultCurrency: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputId = useId();
  const sortSelectId = useId();
  const overdueFilterId = useId();
  const { beginExitTransition } = useTweenOrchestrator();
  
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasLoadedInitialInvoices, setHasLoadedInitialInvoices] = useState(false);

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 10000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; description: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void } | null>(null);

  // Search & Filter State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState<InvoiceSortBy>("invoice_number");
  const [sortDir, setSortDir] = useState<InvoiceSortDirection>("desc");

  // Dialog State
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [editingDueAt, setEditingDueAt] = useState("");
  const [editingLineItems, setEditingLineItems] = useState<EditableLineItem[]>([]);
  const [editingDiscountKind, setEditingDiscountKind] = useState<InvoiceDiscountKind | null>(null);
  const [editingDiscountValueInput, setEditingDiscountValueInput] = useState("");
  const [editingCurrency, setEditingCurrency] = useState(getInvoiceCurrency(defaultCurrency));
  const [editingQuickLessonDurationMinutes, setEditingQuickLessonDurationMinutes] = useState("");
  const [editingProductPresetId, setEditingProductPresetId] = useState("");
  const [editingCustomerFirstName, setEditingCustomerFirstName] = useState("");
  const [editingCustomerLastName, setEditingCustomerLastName] = useState("");
  const [editingPaymentDetailsSource, setEditingPaymentDetailsSource] = useState<InvoiceRow["paymentDetailsSource"]>("system");
  const [editingBankName, setEditingBankName] = useState("");
  const [editingBankBsb, setEditingBankBsb] = useState("");
  const [editingBankAccountName, setEditingBankAccountName] = useState("");
  const [editingBankAccountNumber, setEditingBankAccountNumber] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createSelectedCustomerId, setCreateSelectedCustomerId] = useState("");
  const [createLessonSourceMode, setCreateLessonSourceMode] = useState<CreateLessonSourceMode | null>("multiple_bookings");
  const [createIncludeStandalone, setCreateIncludeStandalone] = useState(false);
  const [createIncludePresets, setCreateIncludePresets] = useState(false);
  const [createStandaloneItems, setCreateStandaloneItems] = useState<CreateStandaloneItemDraft[]>([]);
  const [createSelectedPresetIds, setCreateSelectedPresetIds] = useState<string[]>([]);
  const [createDueAt, setCreateDueAt] = useState("");
  const [createCurrency, setCreateCurrency] = useState(getInvoiceCurrency(defaultCurrency));
  const [createTaxMode, setCreateTaxMode] = useState<InvoiceTaxMode>(getDefaultInvoiceTaxModeForCurrencyValue(defaultCurrency));
  const [createDiscountKind, setCreateDiscountKind] = useState<InvoiceDiscountKind | null>(null);
  const [createDiscountValueInput, setCreateDiscountValueInput] = useState("");
  const [createBookingDialogOpen, setCreateBookingDialogOpen] = useState(false);
  const [createBookingOptionsLoading, setCreateBookingOptionsLoading] = useState(false);
  const [createBookingOptions, setCreateBookingOptions] = useState<CustomerInvoiceBookingOption[]>([]);
  const [createSelectedBookingIds, setCreateSelectedBookingIds] = useState<string[]>([]);
  const [createQuickLessonDurationMinutes, setCreateQuickLessonDurationMinutes] = useState("");
  const [createBookingFilterFrom, setCreateBookingFilterFrom] = useState("");
  const [createBookingFilterTo, setCreateBookingFilterTo] = useState("");

  // NOTE: Auth failures are handled here instead of each button click so all
  // invoice hooks share the same redirect behavior.
  const onAuthError = useCallback(() => window.location.assign("/admin/login"), []);

  // Data Hooks
  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError: setError });
  const { 
    invoices, 
    loading, 
    totalCount, 
    totalPages, 
    load: loadInvoices, 
    save: saveInvoiceApi, 
    performAction: performActionApi, 
    sendBulkReminders: sendBulkRemindersApi,
    remove: removeInvoiceApi
  } = useInvoices({
    pageSize,
    onError: setError,
    onAuthError
  });

  const { presets } = usePresets({ onAuthError, onError: setError });
  const { customers: customerOptions, load: loadCustomers } = useCustomers({ pageSize: 250, onAuthError, onError: setError });
  const { lessonPricingOptions, load: loadLessonPricing } = useLessonPricing({ onAuthError, onError: setError });
  const resolvedEditingCurrency = getInvoiceCurrency(editingCurrency);
  const resolvedCreateCurrency = getInvoiceCurrency(createCurrency);
  const editingTaxLabel = getInvoiceTaxName(resolvedEditingCurrency);
  const createTaxLabel = getInvoiceTaxName(resolvedCreateCurrency);
  const activeLessonPricingMap = useMemo(
    () =>
      new Map(
        lessonPricingOptions
          .filter((option) => option.isActive)
          .map((option) => [option.durationMinutes, option])
      ),
    [lessonPricingOptions]
  );
  const activeLessonPricingChoices = useMemo(
    () =>
      lessonPricingOptions
        .filter((option) => option.isActive)
        .sort((a, b) => a.durationMinutes - b.durationMinutes),
    [lessonPricingOptions]
  );
  const createUsesBookingLessons =
    createLessonSourceMode === "single_booking" || createLessonSourceMode === "multiple_bookings";
  const createUsesQuickLesson = createLessonSourceMode === "single_quick";
  const createUsesSingleBookingLesson = createLessonSourceMode === "single_booking";
  const overdueVisibleCount = useMemo(
    () => invoices.filter((invoice) => invoice.overdueDays !== null && invoice.overdueDays > 0 && invoice.status !== "paid" && invoice.status !== "void").length,
    [invoices]
  );
  const draftVisibleCount = useMemo(
    () => invoices.filter((invoice) => invoice.status === "draft").length,
    [invoices]
  );
  const visibleOpenBalanceCents = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status !== "paid" && invoice.status !== "void")
        .reduce((sum, invoice) => sum + invoice.totalCents, 0),
    [invoices]
  );
  const isInvoicesWorkspaceLoading = loading || !hasLoadedInitialInvoices;

  // Actions
  /**
   * Opens the detail dialog and hydrates its editable fields from the selected
   * invoice row.
   *
   * RATIONALE: The dialog maintains its own mutable copy of notes, names, due
   * date, and line items so admins can make local edits without immediately
   * mutating the list row state underneath.
   */
  const openDetail = useCallback((invoice: InvoiceRow) => {
    setSelectedInvoice(invoice);
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
        discountValueInput: toDiscountValueInput(li.discountKind ?? null, li.discountValue ?? null)
      }))
    );
    setEditingQuickLessonDurationMinutes("");
    setEditingProductPresetId("");
    setNotice("");
    setError("");
  }, []);

  // Effects
  useEffect(() => {
    let cancelled = false;

    void loadInvoices(query, page, overdueOnly, sortBy, sortDir).finally(() => {
      if (!cancelled) {
        setHasLoadedInitialInvoices(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [query, page, overdueOnly, sortBy, sortDir, loadInvoices]);

  useEffect(() => {
    const shouldOpenCreate = searchParams.get("openCreate") === "true";
    const customerId = searchParams.get("customerId");
    const openInvoiceId = searchParams.get("openInvoiceId");
    const nextParams = new URLSearchParams(searchParams.toString());
    let shouldReplace = false;

    if (shouldOpenCreate && !createOpen) {
      // RATIONALE: Other admin surfaces can deep-link into invoice creation.
      // The query params act like a one-time instruction and are cleared
      // immediately after the dialog state has been hydrated.
      setCreateOpen(true);
      void loadCustomers();
      if (customerId) {
        setCreateSelectedCustomerId(customerId);
      }
      nextParams.delete("openCreate");
      nextParams.delete("customerId");
      shouldReplace = true;
    }

    if (openInvoiceId) {
      nextParams.delete("openInvoiceId");
      shouldReplace = true;

      void (async () => {
        try {
          // NOTE: We refetch the just-created invoice instead of trusting the
          // list payload because a create/send flow can redirect here with an ID
          // before the list has been reloaded with the full detail payload.
          const response = await fetch(`/api/admin/invoices/${openInvoiceId}`, { cache: "no-store" });
          if (response.status === 401) {
            onAuthError();
            return;
          }
          if (!response.ok) {
            setError("Invoice was created but could not be loaded.");
            return;
          }
          const payload = await response.json() as { invoice?: InvoiceRow };
          if (payload.invoice) {
            openDetail(payload.invoice);
            setNotice("Draft invoice opened.");
          }
        } catch {
          setError("Unable to load the created invoice.");
        }
      })();
    }

    if (shouldReplace) {
      const query = nextParams.toString();
      // NOTE: `replace` avoids polluting browser history with one-shot dialog
      // bootstrap params that should not reopen on every Back navigation.
      router.replace(query ? `/admin/invoices?${query}` : "/admin/invoices", { scroll: false });
    }
  }, [searchParams, createOpen, loadCustomers, onAuthError, openDetail, router]);

  useEffect(() => {
    if (createOpen || selectedInvoice) {
      void loadLessonPricing();
    }
  }, [createOpen, selectedInvoice, loadLessonPricing]);

  const closeDetail = () => {
    setSelectedInvoice(null);
    setEditingQuickLessonDurationMinutes("");
  };

  const resetCreateDialog = () => {
    setCreateSelectedCustomerId("");
    setCreateLessonSourceMode("multiple_bookings");
    setCreateIncludeStandalone(false);
    setCreateIncludePresets(false);
    setCreateStandaloneItems([]);
    setCreateSelectedPresetIds([]);
    setCreateDueAt("");
    setCreateCurrency(getInvoiceCurrency(defaultCurrency));
    setCreateTaxMode(getDefaultInvoiceTaxModeForCurrencyValue(defaultCurrency));
    setCreateDiscountKind(null);
    setCreateDiscountValueInput("");
    setCreateBookingDialogOpen(false);
    setCreateBookingOptions([]);
    setCreateSelectedBookingIds([]);
    setCreateQuickLessonDurationMinutes("");
    setCreateBookingFilterFrom("");
    setCreateBookingFilterTo("");
  };

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

  const loadCreateBookingOptions = useCallback(async () => {
    if (!createSelectedCustomerId || !createUsesBookingLessons) {
      setCreateBookingOptions([]);
      setCreateSelectedBookingIds([]);
      return;
    }

    setCreateBookingOptionsLoading(true);
    try {
      const params = new URLSearchParams({
        bookingOptions: "true"
      });
      if (createBookingFilterFrom) {
        params.set("from", createBookingFilterFrom);
      }
      if (createBookingFilterTo) {
        params.set("to", createBookingFilterTo);
      }

      const response = await safeFetch(`/api/admin/customers/${createSelectedCustomerId}/invoices?${params.toString()}`, {
        cache: "no-store"
      });
      if (!response.ok) {
        await handleApiError(response, "Failed to load customer bookings.");
        return;
      }

      const data = (await response.json()) as {
        bookingOptions?: CustomerInvoiceBookingOption[];
      };
      const nextOptions = data.bookingOptions ?? [];
      const nextSelectableOptionIds = new Set(
        nextOptions.filter((option) => option.isInvoiceSelectable).map((option) => option.id)
      );
      setCreateBookingOptions(nextOptions);
      setCreateSelectedBookingIds((current) => current.filter((bookingId) => nextSelectableOptionIds.has(bookingId)));
    } finally {
      setCreateBookingOptionsLoading(false);
    }
  }, [
    createBookingFilterFrom,
    createBookingFilterTo,
    createSelectedCustomerId,
    createUsesBookingLessons,
    handleApiError,
    safeFetch
  ]);

  useEffect(() => {
    if (createOpen && createUsesBookingLessons && createSelectedCustomerId) {
      void loadCreateBookingOptions();
    }
  }, [createOpen, createUsesBookingLessons, createSelectedCustomerId, createBookingFilterFrom, createBookingFilterTo, loadCreateBookingOptions]);

  const toggleCreateLessonSource = (mode: CreateLessonSourceMode, enabled: boolean) => {
    const nextMode = enabled ? mode : createLessonSourceMode === mode ? null : createLessonSourceMode;
    if (nextMode !== createLessonSourceMode) {
      setCreateSelectedBookingIds([]);
      setCreateQuickLessonDurationMinutes("");
      setCreateBookingDialogOpen(false);
    }
    setCreateLessonSourceMode(nextMode);
  };

  const toggleCreateSource = (source: CreateSupplementalSource, enabled: boolean) => {
    if (source === "custom") {
      setCreateIncludeStandalone(enabled);
      if (enabled) {
        setCreateStandaloneItems((current) => (current.length > 0 ? current : [makeCreateStandaloneItemDraft()]));
      }
      return;
    }

    setCreateIncludePresets(enabled);
  };

  const addCreateStandaloneItem = () => {
    setCreateStandaloneItems((current) => [...current, makeCreateStandaloneItemDraft()]);
  };

  const updateCreateStandaloneItem = (key: string, patch: Partial<CreateStandaloneItemDraft>) => {
    setCreateStandaloneItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const removeCreateStandaloneItem = (key: string) => {
    setCreateStandaloneItems((current) => current.filter((item) => item.key !== key));
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

  const addQuickLessonToInvoice = (rawDurationMinutes: string) => {
    const durationMinutes = Number.parseInt(rawDurationMinutes, 10);
    if (!Number.isInteger(durationMinutes)) {
      return;
    }

    const lessonPrice = activeLessonPricingMap.get(durationMinutes);
    if (!lessonPrice) {
      setError("Selected lesson duration is no longer available in Lesson Info / Prices.");
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

  const createStandalonePreviewLineItems = useMemo(
    () =>
      createStandaloneItems
        .filter((item) => item.description.trim().length > 0 && item.unitPriceInput.trim().length > 0)
        .map((item) => ({
          description: item.description.trim(),
          quantity: 1,
          unitPriceCents: parseMoneyInputToCents(item.unitPriceInput, resolvedCreateCurrency).cents || 0,
          taxMode: createTaxMode,
          kind: "custom" as const,
          discountKind: null,
          discountValue: null
        })),
    [createStandaloneItems, createTaxMode, resolvedCreateCurrency]
  );

  const createPresetPreviewLineItems = useMemo(
    () =>
      presets
        .filter((preset) => createSelectedPresetIds.includes(preset.id))
        .map((preset) => ({
          description: preset.description || preset.label,
          quantity: 1,
          unitPriceCents: preset.unitPriceCents,
          taxMode: createTaxMode,
          kind: "custom" as const,
          discountKind: preset.discountKind ?? null,
          discountValue: preset.discountValue ?? null
        })),
    [createSelectedPresetIds, createTaxMode, presets]
  );

  const createBookingLessonPreviewLineItems = useMemo(() => {
    if (!createUsesBookingLessons) {
      return [];
    }

      const grouped = new Map<number, number>();
      for (const bookingId of createSelectedBookingIds) {
        const booking = createBookingOptions.find((option) => option.id === bookingId);
        if (!booking) {
          continue;
        }
        grouped.set(booking.durationMinutes, (grouped.get(booking.durationMinutes) ?? 0) + 1);
      }

      return Array.from(grouped.entries())
        .sort(([a], [b]) => a - b)
        .map(([durationMinutes, quantity]) => ({
          description: describeGroupedLessonLine(durationMinutes, quantity),
          quantity,
          unitPriceCents: activeLessonPricingMap.get(durationMinutes)?.priceCents ?? 0,
          taxMode: createTaxMode,
          kind: "lesson_fee" as const,
          discountKind: null,
          discountValue: null
        }));
  }, [
    activeLessonPricingMap,
    createBookingOptions,
    createUsesBookingLessons,
    createSelectedBookingIds,
    createTaxMode
  ]);

  const createQuickLessonPreviewLineItems = useMemo(() => {
    if (!createUsesQuickLesson) {
      return [];
    }

    const durationMinutes = Number.parseInt(createQuickLessonDurationMinutes, 10);
    if (!Number.isInteger(durationMinutes)) {
      return [];
    }

    const lessonPrice = activeLessonPricingMap.get(durationMinutes);
    if (!lessonPrice) {
      return [];
    }

    return [
      {
        description: describeGroupedLessonLine(durationMinutes, 1),
        quantity: 1,
        unitPriceCents: lessonPrice.priceCents,
        taxMode: createTaxMode,
        kind: "lesson_fee" as const,
        discountKind: null,
        discountValue: null
      }
    ];
  }, [
    activeLessonPricingMap,
    createQuickLessonDurationMinutes,
    createTaxMode,
    createUsesQuickLesson
  ]);

  const createPreviewLineItems = useMemo(() => {
    const merged: Array<Omit<InvoiceLineItemDraft, "sortOrder">> = [];

    if (createUsesBookingLessons) {
      merged.push(...createBookingLessonPreviewLineItems);
    }
    if (createUsesQuickLesson) {
      merged.push(...createQuickLessonPreviewLineItems);
    }
    if (createIncludeStandalone) {
      merged.push(...createStandalonePreviewLineItems);
    }
    if (createIncludePresets) {
      merged.push(...createPresetPreviewLineItems);
    }

    return merged.map((lineItem, index) => ({
      ...lineItem,
      sortOrder: index
    }));
  }, [
    createIncludePresets,
    createIncludeStandalone,
    createUsesBookingLessons,
    createUsesQuickLesson,
    createBookingLessonPreviewLineItems,
    createQuickLessonPreviewLineItems,
    createPresetPreviewLineItems,
    createStandalonePreviewLineItems
  ]);

  const createHasIncompleteStandaloneItems = useMemo(
    () =>
      createStandaloneItems.some(
        (item) =>
          (item.description.trim().length > 0 && item.unitPriceInput.trim().length === 0) ||
          (item.description.trim().length === 0 && item.unitPriceInput.trim().length > 0)
      ),
    [createStandaloneItems]
  );

  const createBlockingError = useMemo(() => {
    if (!createLessonSourceMode && !createIncludeStandalone && !createIncludePresets) {
      return "Select at least one invoice source.";
    }
    if (createUsesBookingLessons && createSelectedCustomerId && createSelectedBookingIds.length === 0) {
      return createUsesSingleBookingLesson
        ? "Select one booking to include a single lesson charge."
        : "Select at least one booking to include lesson charges.";
    }
    if (createUsesQuickLesson && createQuickLessonPreviewLineItems.length === 0) {
      return "Select one configured lesson duration to include a single lesson charge.";
    }
    if (createIncludeStandalone && createHasIncompleteStandaloneItems) {
      return "Complete or remove incomplete custom items / services.";
    }
    if (createIncludeStandalone && createStandalonePreviewLineItems.length === 0) {
      return "Add at least one custom item / service with a description and price.";
    }
    if (createIncludePresets && createSelectedPresetIds.length === 0) {
      return "Select at least one preset to include preset charges.";
    }
    return null;
  }, [
    createHasIncompleteStandaloneItems,
    createIncludePresets,
    createIncludeStandalone,
    createLessonSourceMode,
    createQuickLessonPreviewLineItems.length,
    createSelectedCustomerId,
    createSelectedBookingIds.length,
    createSelectedPresetIds.length,
    createUsesBookingLessons,
    createUsesQuickLesson,
    createUsesSingleBookingLesson,
    createStandalonePreviewLineItems.length
  ]);

  const createCalculation = calculateInvoiceTotals(
    createPreviewLineItems,
    {
      discountKind: createDiscountKind,
      discountValue: parseDiscountValueForCurrency(createDiscountKind, createDiscountValueInput, resolvedCreateCurrency)
    },
    {
      currency: resolvedCreateCurrency
    }
  );

  /**
   * Persists the editable detail dialog fields back to the invoice route.
   */
  async function saveInvoiceEdits() {
    if (!selectedInvoice) return;
    setBusyAction("save");
    setError("");

    const dueAt = dateTimeLocalToIso(editingDueAt);
    if (!dueAt) {
      setBusyAction(null);
      setError("Please enter a valid due date and time.");
      return;
    }

    const lineItemsPayload = editingLineItems.map((li) => ({
      id: li.id,
      kind: li.kind,
      description: li.description,
      quantity: li.quantityLocked ? 1 : Number.parseFloat(li.quantity) || 0,
      unitPriceCents: parseMoneyInputToCents(li.unitPriceInput, resolvedEditingCurrency).cents || 0,
      taxMode: li.taxMode,
      discountKind: li.discountKind,
      discountValue: parseDiscountValueForCurrency(li.discountKind, li.discountValueInput, resolvedEditingCurrency)
    }));

    const result = await saveInvoiceApi(selectedInvoice.id, {
      notes: editingNotes,
      dueAt,
      customerFirstName: editingCustomerFirstName,
      customerLastName: editingCustomerLastName,
      customerName: `${editingCustomerFirstName} ${editingCustomerLastName}`.trim(),
      paymentDetailsSource: editingPaymentDetailsSource,
      ...(editingPaymentDetailsSource === "custom"
        ? {
            bankName: editingBankName,
            bankBsb: editingBankBsb,
            bankAccountName: editingBankAccountName,
            bankAccountNumber: editingBankAccountNumber
          }
        : {}),
      currency: resolvedEditingCurrency,
      discountKind: editingDiscountKind,
      discountValue: parseDiscountValueForCurrency(editingDiscountKind, editingDiscountValueInput, resolvedEditingCurrency),
      lineItems: lineItemsPayload
    });

    setBusyAction(null);
    if (result) {
      openDetail(result);
      setNotice("Invoice has been edited and not sent to the customer.");
      // RATIONALE: Refresh the backing list after saving so badges, totals, and
      // pagination rows stay aligned with whatever the server recalculated.
      void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
    }
  }

  /**
   * Runs one lifecycle action from the detail dialog and refreshes both the
   * open dialog and the surrounding table state.
   */
  async function performAction(action: InvoiceAction, confirmed: boolean = false) {
    if (!selectedInvoice) return;
    if (action === "void" && !confirmed) {
      setPendingConfirm({
        title: "Void Invoice",
        description: "Are you sure you want to void this invoice? This cannot be undone.",
        confirmLabel: "Void Invoice",
        destructive: true,
        onConfirm: () => void performAction("void", true)
      });
      return;
    }

    setBusyAction(action);
    setError("");
    const result = await performActionApi(selectedInvoice.id, action);
    setBusyAction(null);

    if (result.invoice) {
      if (action === "send" && !result.partial) {
        setNotice("Invoice email and PDF sent to the customer.");
        closeDetail();
      } else {
        openDetail(result.invoice);
        if (action === "send") {
          setNotice(result.notice || "Invoice was marked as sent, but customer delivery could not be confirmed.");
        } else if (result.notice) {
          setNotice(result.notice);
        } else if (action === "remind") {
          setNotice("Invoice reminder email and PDF sent to the customer.");
        } else {
          setNotice(`Action '${action}' completed.`);
        }
      }
      // NOTE: The table may derive status or overdue display differently from
      // the dialog, so we always reconcile from the server after an action.
      void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
    }
  }

  /**
   * Creates a new invoice draft and optionally chains a send action.
   *
   * RATIONALE: Create-and-send is intentionally modelled as two steps so the UI
   * can still recover cleanly when creation succeeds but outbound email fails.
   */
  async function createInvoice(shouldSend: boolean = false) {
    const customer = customerOptions.find(c => c.id === createSelectedCustomerId);
    if (!customer) {
      setError("Please select a customer.");
      return;
    }

    const dueAt = createDueAt ? dateTimeLocalToIso(createDueAt) : new Date().toISOString();
    if (!dueAt) {
      setError("Please enter a valid due date and time.");
      return;
    }

    setBusyAction(shouldSend ? "create_send" : "create");
    setError("");
    if (createBlockingError) {
      setBusyAction(null);
      setError(createBlockingError);
      return;
    }

    const payload: Record<string, unknown> = {
      dueAt,
      currency: resolvedCreateCurrency,
      taxMode: createTaxMode,
      discountKind: createDiscountKind,
      discountValue: parseDiscountValueForCurrency(createDiscountKind, createDiscountValueInput, resolvedCreateCurrency)
    };

    if (createUsesBookingLessons) {
      payload.bookingIds = createSelectedBookingIds;
    }
    const directCreateLineItems = [
      ...createQuickLessonPreviewLineItems,
      ...createStandalonePreviewLineItems,
      ...createPresetPreviewLineItems
    ];
    if (directCreateLineItems.length > 0) {
      payload.lineItems = [
        ...directCreateLineItems
      ].map((lineItem, index) => ({
        ...lineItem,
        sortOrder: index
      }));
    }

    if (!("bookingIds" in payload) && !("lineItems" in payload)) {
      setBusyAction(null);
      setError("Select at least one invoice source with content before creating the invoice.");
      return;
    }

    let result: InvoiceRow | null = null;
    const response = await safeFetch(`/api/admin/customers/${customer.id}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      setBusyAction(null);
      await handleApiError(response, "Unable to create invoice.");
      return;
    }
    const data = (await response.json()) as { invoice: InvoiceRow };
    result = data.invoice;

    if (result && shouldSend) {
      const sentResult = await performActionApi(result.id, "send");
      setBusyAction(null);
      if (sentResult.invoice) {
        resetCreateDialog();
        setCreateOpen(false);
        setNotice(sentResult.notice || "Invoice created and sent to customer.");
        openDetail(sentResult.invoice);
        void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
      } else {
        resetCreateDialog();
        setCreateOpen(false);
        // RATIONALE: When email delivery fails, we still surface the draft so an
        // admin can inspect or resend it rather than losing the newly created document.
        setNotice("Invoice created but failed to send. Now open in draft.");
        openDetail(result);
        void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
      }
    } else {
      setBusyAction(null);
      if (result) {
        resetCreateDialog();
        setCreateOpen(false);
        setNotice("Invoice created.");
        openDetail(result);
        void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
      }
    }
  }

  function sendBulkReminders() {
    setPendingConfirm({
      title: "Send Bulk Reminders",
      description: "Send email reminders for all overdue invoices?",
      confirmLabel: "Send Reminders",
      onConfirm: () => void doSendBulkReminders()
    });
  }

  async function doSendBulkReminders() {
    setBusyAction("bulk-reminders");
    setError("");
    const count = await sendBulkRemindersApi();
    setBusyAction(null);

    if (count !== null) {
      setNotice(`Sent ${count} overdue reminders.`);
      void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
    }
  }

  const canMarkAsPaid = selectedInvoice
    ? canApplyInvoiceAction(selectedInvoice.status, "mark_paid")
    : false;
  const canMarkAsUnpaid = selectedInvoice
    ? canApplyInvoiceAction(selectedInvoice.status, "mark_unpaid")
    : false;
  const canVoidInvoice = selectedInvoice
    ? canApplyInvoiceAction(selectedInvoice.status, "void")
    : false;
  const canEditSelectedInvoice = selectedInvoice
    ? selectedInvoice.status === "draft" || selectedInvoice.status === "sent"
    : false;
  const isUsingSystemPaymentDetails = editingPaymentDetailsSource === "system";
  const selectedInvoiceDisplayStatus = selectedInvoice ? getDisplayStatus(selectedInvoice, overdueOnly) : null;

  /**
   * Navigates to the linked customer after closing the detail dialog.
   *
   * RATIONALE: The tween orchestrator preserves the app-shell transition flow so
   * moving from billing into customer support feels like one continuous admin task.
   */
  const openLinkedCustomer = () => {
    if (!selectedInvoice?.customerId) return;
    closeDetail();
    void beginExitTransition(null, 0, () => router.push(`/admin/customers?customerId=${selectedInvoice.customerId}&open=true`));
  };

  const header = (
    <>
      <div className="admin-list-col admin-list-col-number">Number</div>
      <Separator />
      <div className="admin-list-col admin-list-col-customer">Customer</div>
      <Separator />
      <div className="admin-list-col admin-list-col-status">Status</div>
      <Separator />
      <div className="admin-list-col admin-list-col-total">Total</div>
      <Separator />
      <div className="admin-list-col admin-list-col-due">Due Date</div>
      <Separator />
      <div className="admin-list-col admin-list-col-actions">Actions</div>
    </>
  );

  return (
    <AdminShell title="Invoices" error={error} notice={notice} loading={isInvoicesWorkspaceLoading} className="admin-shell-invoices">
      <div className="admin-layout-content">
        <AdminCard className="admin-toolbar-card admin-actions-card admin-workspace-panel">
          <div className="admin-workspace-head">
            <div className="admin-workspace-copy">
              <p className="admin-inline-field">Invoice Console</p>
              <h2 className="admin-workspace-title">Billing, reminders, and overdue follow-up</h2>
              <p className="helper-text admin-workspace-summary">
                Monitor invoice status, chase overdue balances, and open customer billing records from one list.
              </p>
              <div className="admin-workspace-chip-row" aria-label="Invoice workspace context">
                <span className="admin-workspace-chip">{overdueOnly ? "Overdue filter on" : "All invoice states"}</span>
                <span className="admin-workspace-chip">{sortDir === "asc" ? "Ascending" : "Descending"}</span>
                <span className="admin-workspace-chip">
                  {sortBy === "invoice_number"
                    ? "Sorted by invoice number"
                    : sortBy === "customer_last_name"
                      ? "Sorted by customer"
                      : sortBy === "status"
                        ? "Sorted by status"
                        : sortBy === "total"
                          ? "Sorted by total"
                          : "Sorted by due date"}
                </span>
              </div>
            </div>
            <div className="admin-workspace-actions">
              <Tooltip content="Create a new invoice for a selected customer.">
                <button className="btn btn-primary" type="button" onClick={() => { setCreateOpen(true); void loadCustomers(); }}>
                  Create Invoice
                </button>
              </Tooltip>
              <Tooltip content="Send reminders for all eligible overdue invoices in one action.">
                <button className="btn btn-secondary" type="button" disabled={busyAction === 'bulk-reminders'} onClick={sendBulkReminders}>
                  {busyAction === 'bulk-reminders' ? "Sending..." : "Send Reminders"}
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="admin-workspace-stats" aria-label="Invoice summary stats">
            <div className="admin-workspace-stat">
              <span className="admin-workspace-stat-label">Visible now</span>
              <strong>{isInvoicesWorkspaceLoading ? "—" : invoices.length}</strong>
            </div>
            <div className="admin-workspace-stat">
              <span className="admin-workspace-stat-label">Total invoices</span>
              <strong>{isInvoicesWorkspaceLoading ? "—" : totalCount}</strong>
            </div>
            <div className="admin-workspace-stat">
              <span className="admin-workspace-stat-label">Drafts visible</span>
              <strong>{isInvoicesWorkspaceLoading ? "—" : draftVisibleCount}</strong>
            </div>
            <div className="admin-workspace-stat">
              <span className="admin-workspace-stat-label">Overdue visible</span>
              <strong>{isInvoicesWorkspaceLoading ? "—" : overdueVisibleCount}</strong>
            </div>
            <div className="admin-workspace-stat">
              <span className="admin-workspace-stat-label">Open balance</span>
              <strong>{isInvoicesWorkspaceLoading ? "—" : toCurrency(visibleOpenBalanceCents, defaultCurrency)}</strong>
            </div>
          </div>

          <div className="admin-actions-bar">
            <div className="admin-toolbar-filters">
              <Tooltip content="Show only invoices that are past their due date.">
                <label className="admin-inline-checkbox" htmlFor={overdueFilterId}>
                  <input
                    id={overdueFilterId}
                    type="checkbox"
                    checked={overdueOnly}
                    onChange={(e) => {
                      setOverdueOnly(e.target.checked);
                      setPage(1);
                    }}
                  />
                  Overdue
                </label>
              </Tooltip>

              <div className="search-box admin-search-box admin-sort-inline-row admin-invoice-search-control">
                <label htmlFor={searchInputId} className="admin-inline-field">
                  Search
                </label>
                <Tooltip content="Search for invoices by number or customer name.">
                  <input
                    id={searchInputId}
                    type="text"
                    value={query}
                    placeholder="Invoice or customer"
                    onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  />
                </Tooltip>
              </div>

              <div className="admin-sort-inline-row">
                <label htmlFor={sortSelectId} className="admin-inline-field">
                  Sort
                </label>
                <Tooltip content="Change the primary sorting field for the invoice list.">
                  <select
                    id={sortSelectId}
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as InvoiceSortBy);
                      setPage(1);
                    }}
                  >
                    <option value="invoice_number">Invoice Number</option>
                    <option value="customer_last_name">Customer (Last Name)</option>
                    <option value="status">Status</option>
                    <option value="total">Total</option>
                    <option value="due_date">Due Date</option>
                  </select>
                </Tooltip>
                <Tooltip content={sortDir === "asc" ? "Sort in ascending order." : "Sort in descending order."}>
                  <button
                    type="button"
                    className="btn btn-secondary admin-sort-direction-btn"
                    onClick={() => {
                      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                      setPage(1);
                    }}
                  >
                    {sortDir === "asc" ? "Asc" : "Desc"}
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        </AdminCard>

        <AdminTable
          header={header}
          loading={loading}
          emptyLabel="No invoices found."
          pagination={{
            currentPage: page,
            totalPages: totalPages,
            totalCount: totalCount,
            pageSize: pageSize,
            onPageChange: setPage,
            onPageSizeChange: setPageSize
          }}
        >
          {invoices.map((inv) => (
            <div 
              key={inv.id} 
              className="invoice-row-item invoice-item invoice-table-row admin-list-row-button"
              onClick={() => openDetail(inv)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openDetail(inv);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Open invoice ${inv.invoiceNumber}`}
            >
              <div className="admin-list-cell admin-list-col-number">
                <span className="admin-mobile-label">Number</span>
                <span className="admin-list-strong">{inv.invoiceNumber}</span>
              </div>
              <Separator />
              <div className="admin-list-cell admin-list-col-customer">
                <span className="admin-mobile-label">Customer</span>
                <div className="admin-list-strong">{inv.customerLastName ? `${inv.customerLastName}, ${inv.customerFirstName}` : inv.customerName}</div>
                <div className="admin-list-subtext">{inv.customerEmail}</div>
              </div>
              <Separator />
              <div className="admin-list-cell admin-list-col-status">
                <span className="admin-mobile-label">Status</span>
                <span className={`status-badge status-${getDisplayStatus(inv, overdueOnly)}`}>
                  {getDisplayStatus(inv, overdueOnly)}
                </span>
              </div>
              <Separator />
              <div className="admin-list-cell admin-list-col-total">
                <span className="admin-mobile-label">Total</span>
                {toCurrency(inv.totalCents, inv.currency)}
              </div>
              <Separator />
              <div className="admin-list-cell admin-list-col-due">
                <span className="admin-mobile-label">Due Date</span>
                {new Date(inv.dueAt).toLocaleDateString("en-AU")}
                {inv.overdueDays !== null && inv.status !== "paid" && inv.status !== "void" && (
                  <div className="admin-list-overdue">{inv.overdueDays} DAYS OVERDUE</div>
                )}
              </div>
              <Separator />
              <div className="customer-item-actions admin-list-actions admin-list-col-actions" onClick={e => e.stopPropagation()}>
                {/* NOTE: Action buttons stop propagation so row-level click-to-open
                    does not fire when the admin only wants the PDF/delete affordance. */}
                <span className="admin-mobile-label">Actions</span>
                <Tooltip content="Open this invoice as a PDF in a new tab.">
                  <button
                    className="btn btn-secondary btn-xs admin-list-action-btn"
                    type="button"
                    onClick={() => window.open(`/api/admin/invoices/${inv.id}/pdf`, '_blank')}
                  >
                    PDF
                  </button>
                </Tooltip>
                <Tooltip content="Open invoice details for editing and lifecycle actions.">
                  <button
                    className="btn btn-secondary btn-xs admin-list-action-btn"
                    type="button"
                    onClick={() => openDetail(inv)}
                  >
                    Open
                  </button>
                </Tooltip>
                <Tooltip content="Delete this invoice record permanently where allowed.">
                  <button
                    className="btn btn-danger btn-xs admin-list-action-btn"
                    type="button"
                    disabled={busyAction === `delete-${inv.id}`}
                    onClick={() => {
                      setPendingConfirm({
                        title: "Delete Invoice",
                        description: "Delete this invoice permanently?",
                        confirmLabel: "Delete",
                        destructive: true,
                        onConfirm: async () => {
                          setBusyAction(`delete-${inv.id}`);
                          await removeInvoiceApi(inv.id);
                          setBusyAction(null);
                          // RATIONALE: Delete changes pagination and filter counts,
                          // so the table must be reloaded from the current server view.
                          void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
                        }
                      });
                    }}
                  >
                    {busyAction === `delete-${inv.id}` ? "..." : "Delete"}
                  </button>
                </Tooltip>
              </div>
            </div>
          ))}
        </AdminTable>
      </div>

      <AppDialog
        isOpen={!!selectedInvoice}
        onClose={closeDetail}
        title={`Invoice ${selectedInvoice?.invoiceNumber}`}
        size="lg"
        id="invoice-detail-dialog"
        bodyClassName="invoice-dialog-body-lock"
        lockBodyScrollArea
        footer={
          <div className="dialog-footer-row invoice-dialog-footer">
            <div className="dialog-footer-left">
              <Tooltip content="Close invoice details and return to the invoice list.">
                <button className="btn btn-secondary" onClick={closeDetail}>Close</button>
              </Tooltip>
              
              {canMarkAsPaid && (
                <Tooltip content="Record payment and move this invoice to paid status.">
                  <button className="btn btn-primary" disabled={!!busyAction} onClick={() => void performAction('mark_paid')}>
                    {busyAction === 'mark_paid' ? 'Saving...' : 'Mark Paid'}
                  </button>
                </Tooltip>
              )}
              {canMarkAsUnpaid && (
                <Tooltip content="Move this invoice back to unpaid status.">
                  <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void performAction('mark_unpaid')}>
                    {busyAction === 'mark_unpaid' ? 'Saving...' : 'Mark Unpaid'}
                  </button>
                </Tooltip>
              )}
              {canVoidInvoice && (
                <Tooltip content="Void this invoice so it is no longer collectible.">
                  <button className="btn btn-danger" disabled={!!busyAction} onClick={() => void performAction('void')}>
                    {busyAction === 'void' ? 'Voiding...' : 'Void Invoice'}
                  </button>
                </Tooltip>
              )}
              <Tooltip content="Permanently delete this invoice record when allowed.">
                <button className="btn btn-danger" disabled={!!busyAction} onClick={() => {
                  setPendingConfirm({
                    title: "Delete Invoice",
                    description: "Delete this invoice permanently?",
                    confirmLabel: "Delete",
                    destructive: true,
                    onConfirm: async () => {
                      await removeInvoiceApi(selectedInvoice!.id);
                      closeDetail();
                      void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
                    }
                  });
                }}>DELETE</button>
              </Tooltip>
            </div>
            <div className="dialog-footer-right">
              <Tooltip content="Save edits to recipient details, payment details, due date, notes, and line items. This does not send the invoice to the customer.">
                <button className="btn btn-secondary" disabled={!!busyAction || !canEditSelectedInvoice} onClick={saveInvoiceEdits}>
                  {busyAction === 'save' ? 'Saving...' : 'Save'}
                </button>
              </Tooltip>
              {selectedInvoice?.status === 'draft' && (
                <Tooltip content="Email this invoice and attached PDF to the customer, then mark it as sent.">
                  <button className="btn btn-primary" disabled={!!busyAction} onClick={() => void performAction('send')}>
                    {busyAction === 'send' ? 'Sending...' : 'Send'}
                  </button>
                </Tooltip>
              )}
              {selectedInvoice?.status !== 'draft' && selectedInvoice?.status !== 'void' && (
                <Tooltip content="Resend invoice notification to the customer.">
                  <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void performAction('remind')}>
                    {busyAction === 'remind' ? 'Sending...' : 'Resend'}
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        }
      >
        {selectedInvoice && (
          <div className="invoice-dialog-body">
            <div className="dialog-layout invoice-dialog-layout">
              <div className="dialog-col invoice-dialog-main-col">
                <h3 className="manual-section-title">Invoice Details</h3>
                <AdminCard ghost className="invoice-dialog-section">
                  <AdminForm className="dialog-form-grid">
                    <AdminField label="First Name" tooltip="Customer's first name.">
                      <input
                        value={editingCustomerFirstName}
                        disabled={!canEditSelectedInvoice}
                        onChange={e => setEditingCustomerFirstName(e.target.value)}
                      />
                    </AdminField>
                    <AdminField label="Last Name" tooltip="Customer's last name.">
                      <input
                        value={editingCustomerLastName}
                        disabled={!canEditSelectedInvoice}
                        onChange={e => setEditingCustomerLastName(e.target.value)}
                      />
                    </AdminField>
                    <AdminField label="Email" tooltip="Primary email for sending the invoice." fullWidth>
                      <input value={selectedInvoice.customerEmail} readOnly />
                    </AdminField>
                    <AdminField label="Due Date" tooltip="When the invoice payment is required.">
                      <input
                        type="datetime-local"
                        value={editingDueAt}
                        disabled={!canEditSelectedInvoice}
                        onChange={(e) => setEditingDueAt(e.target.value)}
                      />
                    </AdminField>
                    <AdminField label="Currency" tooltip="Three-letter ISO currency code used for totals and tax rendering.">
                      <input
                        value={editingCurrency}
                        disabled={!canEditSelectedInvoice}
                        maxLength={3}
                        onChange={(e) => setEditingCurrency(e.target.value.toUpperCase())}
                      />
                    </AdminField>
                    <AdminField label="Invoice Discount Type" tooltip={`Optional discount applied to the full invoice subtotal before ${editingTaxLabel}.`}>
                      <select
                        value={editingDiscountKind ?? ""}
                        disabled={!canEditSelectedInvoice}
                        onChange={(e) => {
                          const nextKind = e.target.value ? (e.target.value as InvoiceDiscountKind) : null;
                          setEditingDiscountKind(nextKind);
                          if (!nextKind) {
                            setEditingDiscountValueInput("");
                          }
                        }}
                      >
                        <option value="">No discount</option>
                        <option value="amount">Fixed amount</option>
                        <option value="percent">Percentage</option>
                      </select>
                    </AdminField>
                    <AdminField label="Invoice Discount Value" tooltip={`Amount discounts use ${resolvedEditingCurrency}. Percentage discounts use %.`}>
                      <input
                        value={editingDiscountValueInput}
                        disabled={!editingDiscountKind || !canEditSelectedInvoice}
                        placeholder={editingDiscountKind === "percent" ? "10%" : "0.00"}
                        onChange={(e) => setEditingDiscountValueInput(e.target.value)}
                      />
                    </AdminField>
                  </AdminForm>
                </AdminCard>

                <h3 className="manual-section-title">Payment Details</h3>
                <AdminCard ghost className="invoice-dialog-section">
                  <AdminForm className="dialog-form-grid">
                    <AdminField label="Payment Source" tooltip="Choose whether this invoice follows the current system payment settings or stores custom payment instructions." fullWidth>
                      <select
                        value={editingPaymentDetailsSource}
                        disabled={!canEditSelectedInvoice}
                        onChange={(e) => setEditingPaymentDetailsSource(e.target.value as InvoiceRow["paymentDetailsSource"])}
                      >
                        <option value="system">Use system payment details</option>
                        <option value="custom">Custom payment details</option>
                      </select>
                    </AdminField>
                    <div className="field full">
                      <p className="helper-text">
                        {isUsingSystemPaymentDetails
                          ? "These payment details come from Admin Settings and will update automatically when the system values change."
                          : "These payment details are saved on this invoice only and will override the system defaults."}
                      </p>
                    </div>
                    <AdminField label="Bank Name" tooltip="Bank shown in the PDF payment instructions.">
                      <input
                        value={editingBankName}
                        disabled={!canEditSelectedInvoice || isUsingSystemPaymentDetails}
                        onChange={(e) => setEditingBankName(e.target.value)}
                      />
                    </AdminField>
                    <AdminField label="BSB" tooltip="BSB shown in the PDF payment instructions.">
                      <input
                        value={editingBankBsb}
                        disabled={!canEditSelectedInvoice || isUsingSystemPaymentDetails}
                        onChange={(e) => setEditingBankBsb(e.target.value)}
                      />
                    </AdminField>
                    <AdminField label="Account Name" tooltip="Account name shown in the PDF payment instructions.">
                      <input
                        value={editingBankAccountName}
                        disabled={!canEditSelectedInvoice || isUsingSystemPaymentDetails}
                        onChange={(e) => setEditingBankAccountName(e.target.value)}
                      />
                    </AdminField>
                    <AdminField label="Account Number" tooltip="Account number shown in the PDF payment instructions.">
                      <input
                        value={editingBankAccountNumber}
                        disabled={!canEditSelectedInvoice || isUsingSystemPaymentDetails}
                        onChange={(e) => setEditingBankAccountNumber(e.target.value)}
                      />
                    </AdminField>
                  </AdminForm>
                </AdminCard>

                <h3 className="manual-section-title">Line Items</h3>
                <AdminCard ghost className="invoice-dialog-line-items-card">
                  <div className="invoice-dialog-line-items-shell">
                    <div className="invoice-dialog-line-items">
                      {editingLineItems.map((li) => (
                        <div
                          key={li.key}
                          className={`invoice-dialog-line-item${li.quantityLocked ? " invoice-dialog-line-item-fixed-quantity" : ""}`}
                        >
                          <div className="invoice-dialog-line-item-main">
                            <AdminField label="Description" tooltip="Line item name or service provided.">
                              <input
                                value={li.description}
                                disabled={!canEditSelectedInvoice}
                                onChange={(e) => updateLineItem(li.key, { description: e.target.value })}
                              />
                            </AdminField>
                          </div>
                          {!li.quantityLocked && (
                            <div className="invoice-dialog-line-item-qty">
                              <AdminField label="Qty" tooltip="Quantity.">
                                <input
                                  type="number"
                                  value={li.quantity}
                                  disabled={!canEditSelectedInvoice}
                                  onChange={(e) => updateLineItem(li.key, { quantity: e.target.value })}
                                />
                              </AdminField>
                            </div>
                          )}
                          <div className="invoice-dialog-line-item-price">
                            <AdminField label="Price" tooltip={`Unit price in ${resolvedEditingCurrency}.`}>
                              <input
                                value={li.unitPriceInput}
                                disabled={!canEditSelectedInvoice}
                                onChange={(e) => updateLineItem(li.key, { unitPriceInput: e.target.value })}
                              />
                            </AdminField>
                          </div>
                          <div className="invoice-dialog-line-item-qty">
                            <AdminField label="Discount Type" tooltip="Optional line-level discount for this item.">
                              <select
                                value={li.discountKind ?? ""}
                                disabled={!canEditSelectedInvoice}
                                onChange={(e) => {
                                  const nextKind = e.target.value ? (e.target.value as InvoiceDiscountKind) : null;
                                  updateLineItem(li.key, {
                                    discountKind: nextKind,
                                    discountValueInput: nextKind ? li.discountValueInput : ""
                                  });
                                }}
                              >
                                <option value="">No discount</option>
                                <option value="amount">Fixed amount</option>
                                <option value="percent">Percentage</option>
                              </select>
                            </AdminField>
                          </div>
                          <div className="invoice-dialog-line-item-price">
                            <AdminField label="Discount Value" tooltip={`Amount discounts use ${resolvedEditingCurrency}. Percentage discounts use %.`}>
                              <input
                                value={li.discountValueInput}
                                disabled={!li.discountKind || !canEditSelectedInvoice}
                                placeholder={li.discountKind === "percent" ? "10%" : "0.00"}
                                onChange={(e) => updateLineItem(li.key, { discountValueInput: e.target.value })}
                              />
                            </AdminField>
                          </div>
                          <Tooltip content="Remove this line item from the invoice.">
                            <button
                              className="btn btn-danger invoice-dialog-remove-item"
                              type="button"
                              disabled={!canEditSelectedInvoice}
                              onClick={() => removeLineItem(li.key)}
                            >
                              ×
                            </button>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                    <div className="button-row invoice-dialog-button-row invoice-dialog-line-actions">
                      <Tooltip content="Add a blank custom item or service that you can customize manually.">
                        <button className="btn btn-secondary" type="button" disabled={!canEditSelectedInvoice} onClick={addLineItem}>Add Custom Item / Service</button>
                      </Tooltip>
                      <div className="invoice-dialog-preset-row invoice-dialog-single-lesson-row">
                        <select
                          className="invoice-product-preset-select invoice-dialog-preset-select"
                          value={editingQuickLessonDurationMinutes}
                          disabled={!canEditSelectedInvoice || activeLessonPricingChoices.length === 0}
                          onChange={(e) => {
                            const selectedDuration = e.target.value;
                            setEditingQuickLessonDurationMinutes(selectedDuration);
                            if (selectedDuration) {
                              addQuickLessonToInvoice(selectedDuration);
                            }
                          }}
                        >
                          <option value="">Add single lesson...</option>
                          {activeLessonPricingChoices.map((option) => (
                            <option key={`edit-quick-lesson-${option.durationMinutes}`} value={String(option.durationMinutes)}>
                              {option.durationMinutes} minutes ({toCurrency(option.priceCents, resolvedEditingCurrency)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="invoice-dialog-preset-row invoice-dialog-add-preset-row">
                        <select
                          className="invoice-product-preset-select invoice-dialog-preset-select"
                          value={editingProductPresetId}
                          disabled={!canEditSelectedInvoice}
                          onChange={(e) => addPresetToInvoice(e.target.value)}
                        >
                          <option value="">Add preset...</option>
                          {presets.map(p => <option key={p.id} value={p.id}>{p.label} ({toCurrency(p.unitPriceCents, resolvedEditingCurrency)}{p.discountKind ? `, ${describeDiscount(p.discountKind, p.discountValue ?? null, resolvedEditingCurrency)} off` : ""})</option>)}
                        </select>
                      </div>
                    </div>
                    {canEditSelectedInvoice && activeLessonPricingChoices.length === 0 && (
                      <p className="helper-text">
                        Add active lesson durations and prices in Lesson Info / Prices before adding single lessons here.
                      </p>
                    )}
                  </div>
                </AdminCard>
              </div>

              <div className="dialog-col is-notes invoice-dialog-side-col">
                <h3 className="manual-section-title">Actions & History</h3>
                <AdminCard ghost>
                  <p className="helper-text">Manage the lifecycle of this invoice.</p>
                  
                  <div className="invoice-dialog-status-card">
                    <div className="invoice-dialog-status-row">
                      <span>Subtotal:</span>
                      <span>{toCurrency(editingCalculation.totals.subtotalCents, resolvedEditingCurrency)}</span>
                    </div>
                    {editingCalculation.totals.discountCents !== 0 && (
                      <div className="invoice-dialog-status-row">
                        <span>Discount:</span>
                        <span>{toCurrency(-editingCalculation.totals.discountCents, resolvedEditingCurrency)}</span>
                      </div>
                    )}
                    <div className="invoice-dialog-status-row">
                      <span>{editingTaxLabel}:</span>
                      <span>{toCurrency(editingCalculation.totals.gstCents, resolvedEditingCurrency)}</span>
                    </div>
                    <div className="invoice-dialog-status-row">
                      <span>Total:</span>
                      <span>{toCurrency(editingCalculation.totals.totalCents, resolvedEditingCurrency)}</span>
                    </div>
                    <div className="invoice-dialog-status-row">
                      <span>Status:</span>
                      <span className={`status-badge status-${selectedInvoiceDisplayStatus ?? selectedInvoice.status}`}>
                        {selectedInvoiceDisplayStatus ?? selectedInvoice.status}
                      </span>
                    </div>
                    {selectedInvoice.status === 'paid' && (
                      <div className="invoice-dialog-status-row">
                        <span>Paid via:</span>
                        <span>{formatPaidVia(selectedInvoice.paidVia)}</span>
                      </div>
                    )}
                    {selectedInvoice.status !== 'paid' && selectedInvoice.status !== 'void' && (
                      <div className="invoice-dialog-status-row invoice-dialog-status-row-alert">
                        <span>Outstanding:</span>
                        <span>{selectedInvoice.overdueDays ?? 0} days</span>
                      </div>
                    )}
                  </div>

                  {selectedInvoice.status === 'draft' && (
                    <p className="helper-text invoice-dialog-help-copy">
                      Mark as Paid becomes available after sending the invoice.
                    </p>
                  )}
                  {selectedInvoice.status === 'sent' && (
                    <p className="helper-text invoice-dialog-help-copy">
                      This sent invoice can still be edited until it is paid or voided.
                    </p>
                  )}
                  {(selectedInvoice.status === 'paid' || selectedInvoice.status === 'void') && (
                    <p className="helper-text invoice-dialog-help-copy">
                      Financial edits are locked once an invoice is {selectedInvoice.status}.
                    </p>
                  )}

                  <AdminField label="Notes" tooltip="Visible to the customer on the public invoice.">
                    <textarea
                      className="invoice-dialog-notes"
                      value={editingNotes}
                      disabled={!canEditSelectedInvoice}
                      onChange={(e) => setEditingNotes(e.target.value)}
                      placeholder="Customer-facing notes..."
                    />
                  </AdminField>

                  <div className="button-row invoice-dialog-button-row invoice-dialog-side-actions">
                    <Tooltip content="Save edits to recipient details, payment details, due date, notes, and line items. This does not send the invoice to the customer.">
                      <button className="btn btn-secondary invoice-dialog-full-width" disabled={!!busyAction || !canEditSelectedInvoice} onClick={saveInvoiceEdits}>
                        {busyAction === 'save' ? 'Saving...' : 'Save Details'}
                      </button>
                    </Tooltip>
                    <Tooltip content="Open this invoice's customer profile in the customers page.">
                      <button className="btn btn-secondary invoice-dialog-full-width" onClick={openLinkedCustomer}>Open Customer</button>
                    </Tooltip>
                    <Tooltip content="Open the printable invoice PDF in a new browser tab.">
                      <button className="btn btn-secondary invoice-dialog-full-width" onClick={() => window.open(`/api/admin/invoices/${selectedInvoice.id}/pdf`, '_blank')}>VIEW PDF</button>
                    </Tooltip>
                  </div>
                </AdminCard>
              </div>
            </div>
          </div>
        )}
      </AppDialog>

      <AppDialog
        isOpen={createOpen}
        onClose={() => {
          resetCreateDialog();
          setCreateOpen(false);
        }}
        title="New Invoice"
        size="lg"
        id="invoice-create-dialog"
        bodyClassName="invoice-dialog-body-lock"
        lockBodyScrollArea
        footer={
          <div className="dialog-footer-row invoice-dialog-footer">
            <div className="dialog-footer-left">
              <Tooltip content="Close the new invoice editor without saving.">
                <button
                  className="btn btn-secondary"
                  disabled={!!busyAction}
                  onClick={() => {
                    resetCreateDialog();
                    setCreateOpen(false);
                  }}
                >
                  Cancel
                </button>
              </Tooltip>
            </div>
            <div className="dialog-footer-right">
              <Tooltip content="Create a new draft invoice only.">
                <button
                  className="btn btn-secondary"
                  disabled={!!busyAction || !createSelectedCustomerId || !!createBlockingError}
                  onClick={() => void createInvoice(false)}
                >
                  {busyAction === "create" ? "Saving..." : "Save Draft"}
                </button>
              </Tooltip>
              <Tooltip content="Create and immediately email the invoice to the customer.">
                <button
                  className="btn btn-primary"
                  disabled={!!busyAction || !createSelectedCustomerId || !!createBlockingError}
                  onClick={() => void createInvoice(true)}
                >
                  {busyAction === "create_send" ? "Sending..." : "Create & Send"}
                </button>
              </Tooltip>
            </div>
          </div>
        }
      >
        <div className="invoice-dialog-body">
          <div className="dialog-layout invoice-dialog-layout">
          <div className="dialog-col invoice-dialog-main-col">
            <h3 className="manual-section-title">Invoice Details</h3>
            <AdminCard ghost className="invoice-dialog-section">
              <AdminForm className="dialog-form-grid">
                <AdminField label="Select Customer" tooltip="Choose which student to bill." fullWidth required>
                  <select
                    className="invoice-dialog-customer-select"
                    value={createSelectedCustomerId}
                    onChange={(e) => {
                      setCreateSelectedCustomerId(e.target.value);
                      setCreateSelectedBookingIds([]);
                    }}
                  >
                    <option value="">-- Choose student --</option>
                    {customerOptions.map(c => <option key={c.id} value={c.id}>{c.lastName ? `${c.lastName}, ${c.firstName}` : c.fullName}</option>)}
                  </select>
                </AdminField>
                <AdminField label="Invoice Sources" tooltip="Choose one or more sources to combine in this invoice." fullWidth>
                  <div className="invoice-dialog-source-list">
                    <label className="admin-inline-checkbox invoice-dialog-source-option">
                      <input
                        type="checkbox"
                        checked={createLessonSourceMode === "single_booking"}
                        onChange={(e) => toggleCreateLessonSource("single_booking", e.target.checked)}
                      />
                      Single Lesson (Booking)
                    </label>
                    <label className="admin-inline-checkbox invoice-dialog-source-option">
                      <input
                        type="checkbox"
                        checked={createLessonSourceMode === "single_quick"}
                        onChange={(e) => toggleCreateLessonSource("single_quick", e.target.checked)}
                      />
                      Single Lesson (Quick Price)
                    </label>
                    <label className="admin-inline-checkbox invoice-dialog-source-option">
                      <input
                        type="checkbox"
                        checked={createLessonSourceMode === "multiple_bookings"}
                        onChange={(e) => toggleCreateLessonSource("multiple_bookings", e.target.checked)}
                      />
                      Multiple Lessons (Bookings)
                    </label>
                    <label className="admin-inline-checkbox invoice-dialog-source-option">
                      <input
                        type="checkbox"
                        checked={createIncludeStandalone}
                        onChange={(e) => toggleCreateSource("custom", e.target.checked)}
                      />
                      Custom Item / Service
                    </label>
                    <label className="admin-inline-checkbox invoice-dialog-source-option">
                      <input
                        type="checkbox"
                        checked={createIncludePresets}
                        disabled={presets.length === 0}
                        onChange={(e) => toggleCreateSource("presets", e.target.checked)}
                      />
                      Multiple Presets
                    </label>
                  </div>
                </AdminField>
                <AdminField label="Currency" tooltip="Three-letter ISO currency code used for this invoice.">
                  <input
                    value={createCurrency}
                    maxLength={3}
                    onChange={(e) => {
                      const nextInput = e.target.value.toUpperCase();
                      setCreateCurrency(nextInput);
                      if (nextInput.trim().length === 3) {
                        setCreateTaxMode(getDefaultInvoiceTaxModeForCurrencyValue(nextInput));
                      }
                    }}
                  />
                </AdminField>
                <AdminField label="Tax Mode" tooltip={`Whether ${createTaxLabel} applies.`}>
                  <select value={createTaxMode} onChange={(e) => setCreateTaxMode(e.target.value as InvoiceTaxMode)}>
                    <option value="taxable">Taxable ({createTaxLabel})</option>
                    <option value="gst_free">{createTaxLabel} Free</option>
                  </select>
                </AdminField>
                {createUsesBookingLessons && (
                  <AdminField
                    label={createUsesSingleBookingLesson ? "Single Lesson Booking" : "Lesson Bookings"}
                    tooltip={
                      createUsesSingleBookingLesson
                        ? "Choose one approved customer booking to include as a single lesson charge."
                        : "Choose approved customer bookings to include as lesson charges."
                    }
                    fullWidth
                    className="invoice-dialog-source-field"
                  >
                    <div className="invoice-dialog-inline-control">
                      <div className="invoice-dialog-status-card invoice-dialog-source-card">
                        <div className="invoice-dialog-status-row">
                          <span>{createUsesSingleBookingLesson ? "Selected booking:" : "Selected bookings:"}</span>
                          <span>{createSelectedBookingIds.length}</span>
                        </div>
                        {createBookingLessonPreviewLineItems.length > 0 ? (
                          createBookingLessonPreviewLineItems.map((lineItem) => (
                            <div key={lineItem.description} className="invoice-dialog-status-row">
                              <span>{lineItem.description}</span>
                              <span>{toCurrency(lineItem.unitPriceCents * lineItem.quantity, resolvedCreateCurrency)}</span>
                            </div>
                          ))
                        ) : (
                          <p className="helper-text">
                            {createSelectedCustomerId
                              ? createUsesSingleBookingLesson
                                ? "Use the calendar button to choose one booking for this invoice."
                                : "Use the calendar button to choose bookings for this invoice."
                              : createUsesSingleBookingLesson
                                ? "Choose a customer first, then use the calendar button to choose one booking for this invoice."
                                : "Choose a customer first, then use the calendar button to choose bookings for this invoice."}
                          </p>
                        )}
                      </div>
                      <Tooltip
                        content={
                          !createSelectedCustomerId
                            ? createUsesSingleBookingLesson
                              ? "Choose a customer first to select one lesson booking."
                              : "Choose a customer first to select lesson bookings."
                            : createUsesSingleBookingLesson
                              ? "Select one lesson booking."
                              : "Select lesson bookings."
                        }
                      >
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon invoice-dialog-inline-trigger"
                          disabled={!createSelectedCustomerId}
                          onClick={() => {
                            setCreateBookingDialogOpen(true);
                            void loadCreateBookingOptions();
                          }}
                          aria-label={createUsesSingleBookingLesson ? "Select one lesson booking" : "Select lesson bookings"}
                        >
                          <CalendarDays size={18} />
                        </button>
                      </Tooltip>
                    </div>
                  </AdminField>
                )}
                {createUsesQuickLesson && (
                  <AdminField
                    label={`Single Lesson Price (${resolvedCreateCurrency})`}
                    tooltip="Choose one active lesson duration to add a single lesson charge without linking a booking."
                    fullWidth
                    className="invoice-dialog-source-field"
                  >
                    <div className="invoice-dialog-inline-control">
                      <select
                        value={createQuickLessonDurationMinutes}
                        onChange={(event) => setCreateQuickLessonDurationMinutes(event.target.value)}
                      >
                        <option value="">-- Choose lesson duration --</option>
                        {activeLessonPricingChoices.map((option) => (
                          <option key={`quick-lesson-${option.durationMinutes}`} value={String(option.durationMinutes)}>
                            {option.durationMinutes} minutes ({toCurrency(option.priceCents, resolvedCreateCurrency)})
                          </option>
                        ))}
                      </select>
                    </div>
                    {createQuickLessonPreviewLineItems.length > 0 ? (
                      <div className="invoice-dialog-status-card invoice-dialog-source-card">
                        {createQuickLessonPreviewLineItems.map((lineItem) => (
                          <div key={lineItem.description} className="invoice-dialog-status-row">
                            <span>{lineItem.description}</span>
                            <span>{toCurrency(lineItem.unitPriceCents * lineItem.quantity, resolvedCreateCurrency)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="helper-text">
                        {activeLessonPricingChoices.length > 0
                          ? "Choose one active lesson duration to add a single lesson charge."
                          : "Add active lesson durations and prices in Lesson Info / Prices before using quick single lessons."}
                      </p>
                    )}
                  </AdminField>
                )}
                {createIncludeStandalone && (
                  <AdminField
                    label={`Custom Items / Services (${resolvedCreateCurrency})`}
                    tooltip="Add one or more custom items or services with a description and price."
                    fullWidth
                    className="invoice-dialog-source-field"
                  >
                    <div className="invoice-dialog-standalone-list">
                      {createStandaloneItems.map((item) => (
                        <div key={item.key} className="invoice-dialog-standalone-row">
                          <input
                            value={item.description}
                            placeholder="Description of service or item"
                            onChange={(e) => updateCreateStandaloneItem(item.key, { description: e.target.value })}
                          />
                          <input
                            value={item.unitPriceInput}
                            placeholder="0.00"
                            onChange={(e) => updateCreateStandaloneItem(item.key, { unitPriceInput: e.target.value })}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary invoice-dialog-standalone-remove"
                            onClick={() => removeCreateStandaloneItem(item.key)}
                            disabled={createStandaloneItems.length === 1}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <div className="button-row invoice-dialog-source-actions">
                        <button className="btn btn-secondary" type="button" onClick={addCreateStandaloneItem}>
                          Add Custom Item / Service
                        </button>
                      </div>
                    </div>
                  </AdminField>
                )}
                {createIncludePresets && (
                  <AdminField label="Preset Items" tooltip="Choose one or more configured products to include." fullWidth className="invoice-dialog-source-field">
                    <div className="invoice-dialog-preset-list">
                      {presets.map(p => (
                        <label key={`create-preset-${p.id}`} className="admin-inline-checkbox invoice-dialog-preset-option">
                          <input 
                            type="checkbox" 
                            checked={createSelectedPresetIds.includes(p.id)}
                            onChange={(e) => {
                              if (e.target.checked) setCreateSelectedPresetIds(prev => [...prev, p.id]);
                              else setCreateSelectedPresetIds(prev => prev.filter(id => id !== p.id));
                            }}
                          />
                          {p.label} ({toCurrency(p.unitPriceCents, resolvedCreateCurrency)}{p.discountKind ? `, ${describeDiscount(p.discountKind, p.discountValue ?? null, resolvedCreateCurrency)} off` : ""})
                        </label>
                      ))}
                    </div>
                  </AdminField>
                )}
                {createBlockingError && (
                  <AdminField label="Create Requirements" fullWidth>
                    <p className="field-error">{createBlockingError}</p>
                  </AdminField>
                )}
                <AdminField label="Due Date (Optional)" tooltip="When the invoice must be paid.">
                  <input type="datetime-local" value={createDueAt} onChange={(e) => setCreateDueAt(e.target.value)} />
                </AdminField>
                <AdminField label="Invoice Discount Type" tooltip={`Optional discount applied to the full invoice subtotal before ${createTaxLabel}.`}>
                  <select
                    value={createDiscountKind ?? ""}
                    onChange={(e) => {
                      const nextKind = e.target.value ? (e.target.value as InvoiceDiscountKind) : null;
                      setCreateDiscountKind(nextKind);
                      if (!nextKind) {
                        setCreateDiscountValueInput("");
                      }
                    }}
                  >
                    <option value="">No discount</option>
                    <option value="amount">Fixed amount</option>
                    <option value="percent">Percentage</option>
                  </select>
                </AdminField>
                <AdminField label="Invoice Discount Value" tooltip={`Amount discounts use ${resolvedCreateCurrency}. Percentage discounts use %.`} fullWidth>
                  <input
                    value={createDiscountValueInput}
                    disabled={!createDiscountKind}
                    placeholder={createDiscountKind === "percent" ? "10%" : "0.00"}
                    onChange={(e) => setCreateDiscountValueInput(e.target.value)}
                  />
                </AdminField>
              </AdminForm>
            </AdminCard>
          </div>
          <div className="dialog-col is-notes invoice-dialog-side-col">
            <h3 className="manual-section-title">Actions & Totals</h3>
            <AdminCard ghost>
              <p className="helper-text">
                {(createUsesBookingLessons || createUsesQuickLesson) && activeLessonPricingChoices.length === 0
                  ? "Add active lesson durations and prices in Lesson Info / Prices before including lesson charges."
                  : "Combine one lesson source, custom items / services, and presets in one invoice. Enabled sources must each contribute at least one item before you can create the invoice."}
              </p>
              <div className="invoice-dialog-status-card">
                <div className="invoice-dialog-status-row">
                  <span>Sources:</span>
                  <span>
                    {[
                      createLessonSourceMode === "single_booking"
                        ? "Single Lesson (Booking)"
                        : createLessonSourceMode === "single_quick"
                          ? "Single Lesson (Quick Price)"
                          : createLessonSourceMode === "multiple_bookings"
                            ? "Multiple Lessons (Bookings)"
                            : null,
                      createIncludeStandalone ? "Custom Item / Service" : null,
                      createIncludePresets ? "Multiple Presets" : null
                    ].filter(Boolean).join(", ") || "None"}
                  </span>
                </div>
                <div className="invoice-dialog-status-row">
                  <span>Subtotal:</span>
                  <span>{toCurrency(createCalculation.totals.subtotalCents, resolvedCreateCurrency)}</span>
                </div>
                {createCalculation.totals.discountCents !== 0 && (
                  <div className="invoice-dialog-status-row">
                    <span>Discount:</span>
                    <span>{toCurrency(-createCalculation.totals.discountCents, resolvedCreateCurrency)}</span>
                  </div>
                )}
                <div className="invoice-dialog-status-row">
                  <span>{createTaxLabel}:</span>
                  <span>{toCurrency(createCalculation.totals.gstCents, resolvedCreateCurrency)}</span>
                </div>
                <div className="invoice-dialog-status-row">
                  <span>Total:</span>
                  <span>{toCurrency(createCalculation.totals.totalCents, resolvedCreateCurrency)}</span>
                </div>
                {createPreviewLineItems.length > 0 && (
                  <>
                    {createPreviewLineItems.map((lineItem) => (
                      <div key={`${lineItem.sortOrder}-${lineItem.description}`} className="invoice-dialog-status-row">
                        <span>{lineItem.description}</span>
                        <span>{toCurrency(lineItem.unitPriceCents * lineItem.quantity, resolvedCreateCurrency)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </AdminCard>
          </div>
        </div>
        </div>
      </AppDialog>

      <AppDialog
        isOpen={createBookingDialogOpen}
        onClose={() => setCreateBookingDialogOpen(false)}
        title={createUsesSingleBookingLesson ? "Select Single Lesson Booking" : "Select Customer Bookings"}
        size="lg"
        footer={
          <div className="dialog-footer-row dialog-footer-row-end">
            <button className="btn btn-secondary" type="button" onClick={() => setCreateBookingDialogOpen(false)}>
              CLOSE
            </button>
          </div>
        }
      >
        <div className="booking-dialog-scroll">
          <AdminForm className="dialog-form-grid">
            <AdminField label="From" tooltip="Optional inclusive start date filter for the booking list.">
              <input type="date" value={createBookingFilterFrom} onChange={(event) => setCreateBookingFilterFrom(event.target.value)} />
            </AdminField>
            <AdminField label="To" tooltip="Optional inclusive end date filter for the booking list.">
              <input type="date" value={createBookingFilterTo} onChange={(event) => setCreateBookingFilterTo(event.target.value)} />
            </AdminField>
            <div className="field">
              <label className="admin-field-label">Actions</label>
              <div className="button-row">
                <button className="btn btn-secondary" type="button" onClick={() => void loadCreateBookingOptions()}>
                  Refresh
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    setCreateBookingFilterFrom("");
                    setCreateBookingFilterTo("");
                  }}
                >
                  Clear Dates
                </button>
              </div>
            </div>
          </AdminForm>

          <AdminCard ghost className="invoice-dialog-section">
            {createBookingOptionsLoading ? (
              <p className="helper-text">Loading bookings...</p>
            ) : createBookingOptions.length === 0 ? (
              <p className="helper-text">No bookings found for the selected customer and date range.</p>
            ) : (
              <div className="invoice-dialog-preset-list">
                {createBookingOptions.map((booking) => {
                  const disabled = !booking.isInvoiceSelectable;
                  return (
                    <label key={booking.id} className="admin-inline-checkbox invoice-dialog-preset-option">
                      <input
                        type={createUsesSingleBookingLesson ? "radio" : "checkbox"}
                        name={createUsesSingleBookingLesson ? "single-create-booking" : undefined}
                        checked={createSelectedBookingIds.includes(booking.id)}
                        disabled={disabled}
                        onChange={(event) => {
                          if (event.target.checked) {
                            if (createUsesSingleBookingLesson) {
                              setCreateSelectedBookingIds([booking.id]);
                            } else {
                              setCreateSelectedBookingIds((current) =>
                                current.includes(booking.id) ? current : [...current, booking.id]
                              );
                            }
                          } else {
                            setCreateSelectedBookingIds((current) => current.filter((bookingId) => bookingId !== booking.id));
                          }
                        }}
                      />
                      <span>
                        {formatDateTime(booking.startAt)} · {booking.durationMinutes} min · {booking.lessonMode === "video" ? "Video" : "In-person"} · {booking.status}
                        {disabled ? ` · ${describeBookingIneligibility(booking.invoiceIneligibilityReason)}` : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </AdminCard>
        </div>
      </AppDialog>
      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel ?? "Confirm"}
        destructive={pendingConfirm?.destructive}
        onConfirm={() => { const cb = pendingConfirm?.onConfirm; setPendingConfirm(null); cb?.(); }}
        onCancel={() => setPendingConfirm(null)}
      />
    </AdminShell>
  );
}
