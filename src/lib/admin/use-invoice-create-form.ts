"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { parseMoneyInputToCents } from "@/lib/invoices/currency";
import { calculateInvoiceTotals } from "@/lib/invoices/calculate";
import { describeGroupedLessonLine } from "@/lib/invoices/booking-links";
import { getDefaultInvoiceTaxModeForCurrencyValue } from "@/lib/invoices/gst-policy";
import { getInvoiceCurrency } from "@/lib/invoices/tax-profile";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import {
  type InvoiceDiscountKind,
  type InvoiceTaxMode
} from "@/lib/admin/use-invoices";
import { type Preset } from "@/lib/admin/use-presets";
import { type LessonPackage } from "@/lib/admin/use-packages";
import { type InvoiceLineItemDraft } from "@/lib/invoices/types";
import {
  makeCreateStandaloneItemDraft,
  parseDiscountValueForCurrency,
  type CreateLessonSourceMode,
  type CreateStandaloneItemDraft,
  type CreateSupplementalSource,
  type CustomerInvoiceBookingOption
} from "@/lib/invoices/invoice-display-helpers";

export interface UseInvoiceCreateFormOptions {
  defaultCurrency: string;
  /** Active lesson durations keyed by minutes, used to price quick-lesson line items. */
  activeLessonPricingMap: Map<number, { priceCents: number }>;
  presets: Preset[];
  /** Active lesson packages selectable as credit-granting invoice lines. */
  packages: LessonPackage[];
  onAuthError?: () => void;
  onError: (message: string) => void;
}

/**
 * Owns the new-invoice editor state plus the derived previews and validation.
 *
 * RATIONALE: Create flow combines several optional invoice sources (bookings,
 * quick lessons, custom items, presets) whose previews and blocking validation
 * all derive from local draft state. Keeping them in one hook lets the dialog
 * stay presentational and the orchestrator focus on submit/handoff transitions.
 */
export function useInvoiceCreateForm({
  defaultCurrency,
  activeLessonPricingMap,
  presets,
  packages,
  onAuthError,
  onError
}: UseInvoiceCreateFormOptions) {
  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

  const [createOpen, setCreateOpen] = useState(false);
  const [createSelectedCustomerId, setCreateSelectedCustomerId] = useState("");
  const [createLessonSourceMode, setCreateLessonSourceMode] = useState<CreateLessonSourceMode | null>("multiple_bookings");
  const [createIncludeStandalone, setCreateIncludeStandalone] = useState(false);
  const [createIncludePresets, setCreateIncludePresets] = useState(false);
  const [createIncludePackages, setCreateIncludePackages] = useState(false);
  const [createStandaloneItems, setCreateStandaloneItems] = useState<CreateStandaloneItemDraft[]>([]);
  const [createSelectedPresetIds, setCreateSelectedPresetIds] = useState<string[]>([]);
  const [createSelectedPackageIds, setCreateSelectedPackageIds] = useState<string[]>([]);
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

  const resolvedCreateCurrency = getInvoiceCurrency(createCurrency);
  const createUsesBookingLessons =
    createLessonSourceMode === "single_booking" || createLessonSourceMode === "multiple_bookings";
  const createUsesQuickLesson = createLessonSourceMode === "single_quick";
  const createUsesSingleBookingLesson = createLessonSourceMode === "single_booking";

  const resetCreateDialog = () => {
    setCreateSelectedCustomerId("");
    setCreateLessonSourceMode("multiple_bookings");
    setCreateIncludeStandalone(false);
    setCreateIncludePresets(false);
    setCreateIncludePackages(false);
    setCreateStandaloneItems([]);
    setCreateSelectedPresetIds([]);
    setCreateSelectedPackageIds([]);
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

    if (source === "packages") {
      setCreateIncludePackages(enabled);
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

  const createPackagePreviewLineItems = useMemo(
    () =>
      packages
        .filter((pkg) => createSelectedPackageIds.includes(pkg.id))
        .map((pkg) => ({
          description: pkg.label,
          quantity: 1,
          unitPriceCents: pkg.priceCents,
          taxMode: createTaxMode,
          kind: "custom" as const,
          discountKind: null,
          discountValue: null,
          // The packageId is the load-bearing field: paying this invoice grants
          // the package's prepaid lesson credits via grantCreditsForPaidInvoice.
          packageId: pkg.id
        })),
    [createSelectedPackageIds, createTaxMode, packages]
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
    if (createIncludePackages) {
      merged.push(...createPackagePreviewLineItems);
    }

    return merged.map((lineItem, index) => ({
      ...lineItem,
      sortOrder: index
    }));
  }, [
    createIncludePresets,
    createIncludePackages,
    createIncludeStandalone,
    createUsesBookingLessons,
    createUsesQuickLesson,
    createBookingLessonPreviewLineItems,
    createQuickLessonPreviewLineItems,
    createPresetPreviewLineItems,
    createPackagePreviewLineItems,
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
    if (!createLessonSourceMode && !createIncludeStandalone && !createIncludePresets && !createIncludePackages) {
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
    if (createIncludePackages && createSelectedPackageIds.length === 0) {
      return "Select at least one package to include package charges.";
    }
    return null;
  }, [
    createHasIncompleteStandaloneItems,
    createIncludePresets,
    createIncludePackages,
    createIncludeStandalone,
    createLessonSourceMode,
    createQuickLessonPreviewLineItems.length,
    createSelectedCustomerId,
    createSelectedBookingIds.length,
    createSelectedPresetIds.length,
    createSelectedPackageIds.length,
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

  return {
    createOpen,
    setCreateOpen,
    createSelectedCustomerId,
    setCreateSelectedCustomerId,
    createLessonSourceMode,
    createIncludeStandalone,
    createIncludePresets,
    createIncludePackages,
    createStandaloneItems,
    createSelectedPresetIds,
    setCreateSelectedPresetIds,
    createSelectedPackageIds,
    setCreateSelectedPackageIds,
    createDueAt,
    setCreateDueAt,
    createCurrency,
    setCreateCurrency,
    createTaxMode,
    setCreateTaxMode,
    createDiscountKind,
    setCreateDiscountKind,
    createDiscountValueInput,
    setCreateDiscountValueInput,
    createBookingDialogOpen,
    setCreateBookingDialogOpen,
    createBookingOptionsLoading,
    createBookingOptions,
    createSelectedBookingIds,
    setCreateSelectedBookingIds,
    createQuickLessonDurationMinutes,
    setCreateQuickLessonDurationMinutes,
    createBookingFilterFrom,
    setCreateBookingFilterFrom,
    createBookingFilterTo,
    setCreateBookingFilterTo,
    resolvedCreateCurrency,
    createUsesBookingLessons,
    createUsesQuickLesson,
    createUsesSingleBookingLesson,
    resetCreateDialog,
    loadCreateBookingOptions,
    toggleCreateLessonSource,
    toggleCreateSource,
    addCreateStandaloneItem,
    updateCreateStandaloneItem,
    removeCreateStandaloneItem,
    createStandalonePreviewLineItems,
    createPresetPreviewLineItems,
    createPackagePreviewLineItems,
    createBookingLessonPreviewLineItems,
    createQuickLessonPreviewLineItems,
    createPreviewLineItems,
    createBlockingError,
    createCalculation
  };
}
