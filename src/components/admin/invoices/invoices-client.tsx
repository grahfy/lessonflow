"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminTable, AdminTableSeparator as Separator } from "@/components/admin/ui/admin-table";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { useTweenOrchestrator } from "@/components/motion/tween-orchestrator";
import { basisPointsToPercentageInput, formatCurrency, parseMoneyInputToCents, parsePercentageInputToBasisPoints } from "@/lib/invoices/currency";
import { toDateTimeLocalValue, toMoneyInput } from "@/lib/admin/formatters";
import { dateTimeLocalToIso } from "@/lib/time";

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
  unitPriceInput: string;
  taxMode: InvoiceTaxMode;
  discountKind: InvoiceDiscountKind | null;
  discountValueInput: string;
  isPreset?: boolean;
};

type CreateInvoiceBasis = "lesson_based" | "standalone" | (string & {});
type InvoiceDisplayStatus = InvoiceRow["status"] | "overdue";

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

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 10000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const [busyAction, setBusyAction] = useState<string | null>(null);

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
  const [editingProductPresetId, setEditingProductPresetId] = useState("");
  const [editingCustomerFirstName, setEditingCustomerFirstName] = useState("");
  const [editingCustomerLastName, setEditingCustomerLastName] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createSelectedCustomerId, setCreateSelectedCustomerId] = useState("");
  const [createInvoiceBasis, setCreateInvoiceBasis] = useState<CreateInvoiceBasis>("lesson_based");
  const [createLessonPrice, setCreateLessonPrice] = useState("60.00");
  const [createStandalonePrice, setCreateStandalonePrice] = useState("0.00");
  const [createSelectedPresetIds, setCreateSelectedPresetIds] = useState<string[]>([]);
  const [createDueAt, setCreateDueAt] = useState("");
  const [createCurrency, setCreateCurrency] = useState(getInvoiceCurrency(defaultCurrency));
  const [createTaxMode, setCreateTaxMode] = useState<InvoiceTaxMode>(getDefaultInvoiceTaxModeForCurrencyValue(defaultCurrency));
  const [createDiscountKind, setCreateDiscountKind] = useState<InvoiceDiscountKind | null>(null);
  const [createDiscountValueInput, setCreateDiscountValueInput] = useState("");

  // NOTE: Auth failures are handled here instead of each button click so all
  // invoice hooks share the same redirect behavior.
  const onAuthError = useCallback(() => window.location.assign("/admin/login"), []);

  // Data Hooks
  const { 
    invoices, 
    loading, 
    totalCount, 
    totalPages, 
    load: loadInvoices, 
    save: saveInvoiceApi, 
    performAction: performActionApi, 
    create: createInvoiceApi,
    sendBulkReminders: sendBulkRemindersApi,
    remove: removeInvoiceApi
  } = useInvoices({
    pageSize,
    onError: setError,
    onAuthError
  });

  const { presets } = usePresets({ onAuthError, onError: setError });
  const { customers: customerOptions, load: loadCustomers } = useCustomers({ pageSize: 250, onAuthError, onError: setError });
  const resolvedEditingCurrency = getInvoiceCurrency(editingCurrency);
  const resolvedCreateCurrency = getInvoiceCurrency(createCurrency);
  const editingTaxLabel = getInvoiceTaxName(resolvedEditingCurrency);
  const createTaxLabel = getInvoiceTaxName(resolvedCreateCurrency);

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
    setEditingLineItems(
      invoice.lineItems.map((li) => ({
        key: li.id,
        id: li.id,
        kind: li.kind as InvoiceLineItemDraft["kind"],
        description: li.description,
        quantity: String(li.quantity),
        unitPriceInput: toMoneyInput(li.unitPriceCents),
        taxMode: li.taxMode,
        discountKind: li.discountKind ?? null,
        discountValueInput: toDiscountValueInput(li.discountKind ?? null, li.discountValue ?? null)
      }))
    );
    setEditingProductPresetId("");
    setNotice("");
    setError("");
  }, []);

  // Effects
  useEffect(() => {
    void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
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

  const closeDetail = () => setSelectedInvoice(null);

  const resetCreateDialog = () => {
    setCreateSelectedCustomerId("");
    setCreateInvoiceBasis("lesson_based");
    setCreateLessonPrice("60.00");
    setCreateStandalonePrice("0.00");
    setCreateSelectedPresetIds([]);
    setCreateDueAt("");
    setCreateCurrency(getInvoiceCurrency(defaultCurrency));
    setCreateTaxMode(getDefaultInvoiceTaxModeForCurrencyValue(defaultCurrency));
    setCreateDiscountKind(null);
    setCreateDiscountValueInput("");
  };

  const addLineItem = () => {
    setEditingLineItems((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        kind: "custom",
        description: "",
        quantity: "1",
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
        unitPriceInput: toMoneyInput(preset.unitPriceCents),
        taxMode: getDefaultInvoiceTaxModeForCurrencyValue(resolvedEditingCurrency),
        discountKind: preset.discountKind ?? null,
        discountValueInput: toDiscountValueInput(preset.discountKind ?? null, preset.discountValue ?? null),
        isPreset: true
      }
    ]);
    setEditingProductPresetId("");
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
      quantity: Number.parseFloat(li.quantity) || 0,
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

  const createCalculation = calculateInvoiceTotals(
    (() => {
      if (createInvoiceBasis === "presets") {
        return presets
          .filter((preset) => createSelectedPresetIds.includes(preset.id))
          .map((preset, index) => ({
            description: preset.description || preset.label,
            quantity: 1,
            unitPriceCents: preset.unitPriceCents,
            taxMode: createTaxMode,
            kind: "custom" as const,
            sortOrder: index,
            discountKind: preset.discountKind ?? null,
            discountValue: preset.discountValue ?? null
          }));
      }

      const amount = createInvoiceBasis === "standalone"
        ? parseMoneyInputToCents(createStandalonePrice, resolvedCreateCurrency).cents || 0
        : parseMoneyInputToCents(createLessonPrice, resolvedCreateCurrency).cents || 0;

      return [
        {
          description: "Standard Lesson Fee",
          quantity: 1,
          unitPriceCents: amount,
          taxMode: createTaxMode,
          kind: "lesson_fee" as const,
          sortOrder: 0,
          discountKind: null,
          discountValue: null
        }
      ];
    })(),
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
      quantity: Number.parseFloat(li.quantity) || 0,
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
      currency: resolvedEditingCurrency,
      discountKind: editingDiscountKind,
      discountValue: parseDiscountValueForCurrency(editingDiscountKind, editingDiscountValueInput, resolvedEditingCurrency),
      lineItems: lineItemsPayload
    });

    setBusyAction(null);
    if (result) {
      openDetail(result);
      setNotice("Invoice saved successfully.");
      // RATIONALE: Refresh the backing list after saving so badges, totals, and
      // pagination rows stay aligned with whatever the server recalculated.
      void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
    }
  }

  /**
   * Runs one lifecycle action from the detail dialog and refreshes both the
   * open dialog and the surrounding table state.
   */
  async function performAction(action: InvoiceAction) {
    if (!selectedInvoice) return;
    if (action === "void" && !window.confirm("Are you sure you want to void this invoice? This cannot be undone.")) return;

    setBusyAction(action);
    setError("");
    const result = await performActionApi(selectedInvoice.id, action);
    setBusyAction(null);

    if (result.invoice) {
      openDetail(result.invoice);
      if (result.notice) {
        setNotice(result.notice);
        if ((action === "send" || action === "remind") && !result.partial) {
          alert("Invoice has been sent to the customer.");
        }
      } else if (action === "send" || action === "remind") {
        setNotice("Invoice notification sent.");
        alert("Invoice has been sent to the customer.");
      } else {
        setNotice(`Action '${action}' completed.`);
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

    const payload = {
      customerId: createSelectedCustomerId,
      customerFirstName: customer.firstName || customer.fullName.split(' ')[0],
      customerLastName: customer.lastName || customer.fullName.split(' ').slice(1).join(' '),
      customerName: customer.fullName,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerAddress: [
        customer.unitNumber ? `${customer.unitNumber}/` : "",
        customer.houseNumber,
        customer.streetName,
        customer.streetType,
        customer.suburb,
        customer.state,
        customer.postcode
      ].filter(Boolean).join(" "),
      basis: createInvoiceBasis,
      currency: resolvedCreateCurrency,
      lessonPriceCents: parseMoneyInputToCents(createLessonPrice, resolvedCreateCurrency).cents || 0,
      standalonePriceCents: parseMoneyInputToCents(createStandalonePrice, resolvedCreateCurrency).cents || 0,
      dueAt,
      taxMode: createTaxMode,
      discountKind: createDiscountKind,
      discountValue: parseDiscountValueForCurrency(createDiscountKind, createDiscountValueInput, resolvedCreateCurrency),
      lineItems: (() => {
        if (createInvoiceBasis === "standalone" || createInvoiceBasis === "lesson_based") {
          return [{
            description: "Standard Lesson Fee",
            quantity: 1,
            unitPriceCents:
              createInvoiceBasis === "standalone"
                ? parseMoneyInputToCents(createStandalonePrice, resolvedCreateCurrency).cents || 0
                : parseMoneyInputToCents(createLessonPrice, resolvedCreateCurrency).cents || 0,
            kind: "lesson_fee",
            taxMode: createTaxMode,
            discountKind: null,
            discountValue: null
          }];
        }
        if (createInvoiceBasis === "presets") {
          // NOTE: Presets are resolved client-side so the create route receives
          // an explicit immutable line-item payload rather than preset IDs.
          const selectedPresets = presets.filter(p => createSelectedPresetIds.includes(p.id));
          return selectedPresets.map(preset => ({
            description: preset.description || preset.label,
            quantity: 1,
            unitPriceCents: preset.unitPriceCents,
            kind: "custom",
            taxMode: createTaxMode,
            discountKind: preset.discountKind ?? null,
            discountValue: preset.discountValue ?? null
          }));
        }
        return undefined;
      })()
    };

    const result = await createInvoiceApi(payload);

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

  async function sendBulkReminders() {
    if (!window.confirm("Send email reminders for all overdue invoices?")) return;
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
    <AdminShell title="Invoices" error={error} notice={notice} className="admin-shell-invoices">
      <div className="admin-layout-content">
        <AdminCard className="admin-toolbar-card admin-actions-card">
          <div className="admin-actions-bar">
            <div className="admin-actions-group">
              <Tooltip content="Create a new invoice for a selected customer.">
                <button className="btn btn-primary" type="button" onClick={() => { setCreateOpen(true); void loadCustomers(); }}>
                  New Invoice
                </button>
              </Tooltip>
              <Tooltip content="Send reminders for all eligible overdue invoices in one action.">
                <button className="btn btn-secondary" type="button" disabled={busyAction === 'bulk-reminders'} onClick={sendBulkReminders}>
                  {busyAction === 'bulk-reminders' ? "Sending..." : "Send Reminders"}
                </button>
              </Tooltip>
            </div>

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
                    className="btn btn-secondary admin-list-action-btn"
                    type="button"
                    onClick={() => window.open(`/api/admin/invoices/${inv.id}/pdf`, '_blank')}
                  >
                    PDF
                  </button>
                </Tooltip>
                <Tooltip content="Open invoice details for editing and lifecycle actions.">
                  <button
                    className="btn btn-secondary admin-list-action-btn"
                    type="button"
                    onClick={() => openDetail(inv)}
                  >
                    Open
                  </button>
                </Tooltip>
                <Tooltip content="Delete this invoice record permanently where allowed.">
                  <button
                    className="btn btn-danger admin-list-action-btn"
                    type="button"
                    disabled={busyAction === `delete-${inv.id}`}
                    onClick={async () => {
                      if (window.confirm("Delete this invoice permanently?")) {
                        setBusyAction(`delete-${inv.id}`);
                        await removeInvoiceApi(inv.id);
                        setBusyAction(null);
                        // RATIONALE: Delete changes pagination and filter counts,
                        // so the table must be reloaded from the current server view.
                        void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
                      }
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

      <AdminDialog
        isOpen={!!selectedInvoice}
        onClose={closeDetail}
        title={`Invoice ${selectedInvoice?.invoiceNumber}`}
        wide
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
                <button className="btn btn-danger" disabled={!!busyAction} onClick={async () => {
                  if (window.confirm("Delete this invoice permanently?")) {
                    await removeInvoiceApi(selectedInvoice!.id);
                    closeDetail();
                    void loadInvoices(query, page, overdueOnly, sortBy, sortDir);
                  }
                }}>DELETE</button>
              </Tooltip>
            </div>
            <div className="dialog-footer-right">
              <Tooltip content="Save edits to recipient details, due date, notes, and line items.">
                <button className="btn btn-secondary" disabled={!!busyAction || !canEditSelectedInvoice} onClick={saveInvoiceEdits}>
                  {busyAction === 'save' ? 'Saving...' : 'Save'}
                </button>
              </Tooltip>
              {selectedInvoice?.status === 'draft' && (
                <Tooltip content="Email this invoice to the customer and mark it as sent.">
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
                    <AdminField label="Invoice Discount Value" tooltip={`Amount discounts use ${resolvedEditingCurrency}. Percentage discounts use %.`} fullWidth>
                      <input
                        value={editingDiscountValueInput}
                        disabled={!editingDiscountKind || !canEditSelectedInvoice}
                        placeholder={editingDiscountKind === "percent" ? "10%" : "0.00"}
                        onChange={(e) => setEditingDiscountValueInput(e.target.value)}
                      />
                    </AdminField>
                    <AdminField label="Notes" tooltip="Visible to the customer on the public invoice." fullWidth>
                      <textarea
                        className="invoice-dialog-notes"
                        value={editingNotes}
                        disabled={!canEditSelectedInvoice}
                        onChange={(e) => setEditingNotes(e.target.value)}
                        placeholder="Customer-facing notes..."
                      />
                    </AdminField>
                  </AdminForm>
                  <div className="button-row invoice-dialog-button-row">
                    <Tooltip content="Save edits to recipient details, due date, notes, and line items.">
                      <button className="btn btn-secondary" disabled={!!busyAction || !canEditSelectedInvoice} onClick={saveInvoiceEdits}>
                        {busyAction === 'save' ? 'Saving...' : 'Save Details'}
                      </button>
                    </Tooltip>
                    <Tooltip content="Open this invoice's customer profile in the customers page.">
                      <button className="btn btn-secondary" onClick={openLinkedCustomer}>Open Customer</button>
                    </Tooltip>
                  </div>
                </AdminCard>

                <h3 className="manual-section-title">Line Items</h3>
                <AdminCard ghost className="invoice-dialog-line-items-card">
                  <div className="invoice-dialog-line-items-shell">
                    <div className="invoice-dialog-line-items">
                      {editingLineItems.map((li) => (
                        <div key={li.key} className="invoice-dialog-line-item">
                          <div className="invoice-dialog-line-item-main">
                            <AdminField label="Description" tooltip="Line item name or service provided.">
                              <input
                                value={li.description}
                                disabled={!canEditSelectedInvoice}
                                onChange={(e) => updateLineItem(li.key, { description: e.target.value })}
                              />
                            </AdminField>
                          </div>
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
                      <Tooltip content="Add a blank line item that you can customize manually.">
                        <button className="btn btn-secondary" type="button" disabled={!canEditSelectedInvoice} onClick={addLineItem}>Add Line Item</button>
                      </Tooltip>
                      <div className="invoice-dialog-preset-row">
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

                  <div className="button-row invoice-dialog-stacked-actions">
                    <Tooltip content="Open the printable invoice PDF in a new browser tab.">
                      <button className="btn btn-secondary invoice-dialog-full-width" onClick={() => window.open(`/api/admin/invoices/${selectedInvoice.id}/pdf`, '_blank')}>VIEW PDF</button>
                    </Tooltip>
                  </div>
                </AdminCard>
              </div>
            </div>
          </div>
        )}
      </AdminDialog>

      <AdminDialog
        isOpen={createOpen}
        onClose={() => {
          resetCreateDialog();
          setCreateOpen(false);
        }}
        title="Create New Invoice"
        wide
        id="invoice-create-dialog"
        footer={
          <div className="dialog-footer-row dialog-footer-row-end">
            <Tooltip content="Close the create invoice dialog without saving.">
              <button
                className="btn btn-secondary"
                disabled={!!busyAction}
                onClick={() => {
                  resetCreateDialog();
                  setCreateOpen(false);
                }}
              >
                CANCEL
              </button>
            </Tooltip>
            <Tooltip content="Create a new draft invoice only.">
              <button className="btn btn-secondary" disabled={!!busyAction || !createSelectedCustomerId} onClick={() => void createInvoice(false)}>
                {busyAction === 'create' ? 'SAVING...' : 'SAVE DRAFT'}
              </button>
            </Tooltip>
            <Tooltip content="Create and immediately email the invoice to the customer.">
              <button className="btn btn-primary" disabled={!!busyAction || !createSelectedCustomerId} onClick={() => void createInvoice(true)}>
                {busyAction === 'create_send' ? 'SENDING...' : 'CREATE & SEND'}
              </button>
            </Tooltip>
          </div>
        }
      >
        <div className="booking-dialog-scroll">
          <div className="dialog-layout">
          <div className="dialog-col">
            <h3 className="manual-section-title">Recipient & Basis</h3>
            <AdminCard ghost className="invoice-dialog-section">
              <AdminForm className="dialog-form-grid">
                <AdminField label="Select Customer" tooltip="Choose which student to bill." fullWidth required>
                  <select className="invoice-dialog-customer-select" value={createSelectedCustomerId} onChange={(e) => setCreateSelectedCustomerId(e.target.value)}>
                    <option value="">-- Choose student --</option>
                    {customerOptions.map(c => <option key={c.id} value={c.id}>{c.lastName ? `${c.lastName}, ${c.firstName}` : c.fullName}</option>)}
                  </select>
                </AdminField>
                <AdminField label="Invoice Basis" tooltip="How to generate line items for this invoice.">
                  <select value={createInvoiceBasis} onChange={(e) => setCreateInvoiceBasis(e.target.value as CreateInvoiceBasis)}>
                    <option value="lesson_based">Lessons (Calculated from bookings)</option>
                    <option value="standalone">Standalone (Manual line items)</option>
                    {/* RATIONALE: Preset-driven creation is only useful once at
                        least one preset exists, so the option is hidden otherwise. */}
                    {presets.length > 0 && (
                      <option value="presets">Multiple Presets (Select below)...</option>
                    )}
                  </select>
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
                {createInvoiceBasis === 'lesson_based' && (
                  <AdminField label={`Lesson Rate (${resolvedCreateCurrency})`} tooltip="Price per standard lesson block for this billing period.">
                    <input value={createLessonPrice} onChange={(e) => setCreateLessonPrice(e.target.value)} />
                  </AdminField>
                )}
                {createInvoiceBasis === 'standalone' && (
                  <AdminField label={`Initial Item Price (${resolvedCreateCurrency})`} tooltip="Starting price for the manual line item.">
                    <input value={createStandalonePrice} onChange={(e) => setCreateStandalonePrice(e.target.value)} />
                  </AdminField>
                )}
                {createInvoiceBasis === 'presets' && (
                  <AdminField label="Select Presets" tooltip="Choose one or more configured products." fullWidth>
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
          <div className="dialog-col is-notes">
            <h3 className="manual-section-title">Help</h3>
            <AdminCard ghost>
              <p className="helper-text">
                {createInvoiceBasis === 'lesson_based' 
                  ? "This will automatically pull all approved bookings for the selected customer that haven't been invoiced yet."
                  : createInvoiceBasis === 'standalone'
                  ? "This will create a blank invoice with one line item at the specified price. You can add more items after creation."
                  : "This will create a blank invoice pre-filled with the selected preset items."}
              </p>
              <div className="invoice-dialog-status-card">
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
              </div>
            </AdminCard>
          </div>
        </div>
        </div>
      </AdminDialog>
    </AdminShell>
  );
}
