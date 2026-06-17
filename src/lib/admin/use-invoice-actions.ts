"use client";

import { useState } from "react";

import { parseMoneyInputToCents } from "@/lib/invoices/currency";
import { dateTimeLocalToIso } from "@/lib/time";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import {
  type InvoiceAction,
  type InvoiceActionResult,
  type InvoiceRow
} from "@/lib/admin/use-invoices";
import { parseDiscountValueForCurrency } from "@/lib/invoices/invoice-display-helpers";
import { type useInvoiceDetailForm } from "@/lib/admin/use-invoice-detail-form";
import { type useInvoiceCreateForm } from "@/lib/admin/use-invoice-create-form";

type DetailForm = ReturnType<typeof useInvoiceDetailForm>;
type CreateForm = ReturnType<typeof useInvoiceCreateForm>;

export interface PendingConfirm {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export interface UseInvoiceActionsOptions {
  detailForm: DetailForm;
  createForm: CreateForm;
  /** API surface from useInvoices. */
  saveInvoiceApi: (id: string, payload: Record<string, unknown>) => Promise<InvoiceRow | null>;
  performActionApi: (id: string, action: InvoiceAction) => Promise<InvoiceActionResult>;
  sendBulkRemindersApi: () => Promise<number | null>;
  removeInvoiceApi: (id: string) => Promise<boolean>;
  /** Reloads the backing list with the current filter/sort/page state. */
  reloadInvoices: () => void;
  /** Opens (and hydrates) the detail dialog for a freshly fetched invoice. */
  openDetail: (invoice: InvoiceRow) => void;
  closeDetail: () => void;
  customerOptions: Array<{ id: string }>;
  selectedInvoice: InvoiceRow | null;
  setNotice: (message: string) => void;
  setError: (message: string) => void;
  setPendingConfirm: (value: PendingConfirm | null) => void;
}

/**
 * Coordinates the invoice screen's mutating workflows.
 *
 * RATIONALE: Save / lifecycle action / create-and-send / bulk reminders / delete
 * all read draft state, call the API hook, then reconcile both the open dialog
 * and the surrounding list. Centralizing them keeps the orchestrator declarative
 * while preserving the exact recovery semantics (for example, surfacing a draft
 * when create succeeds but send fails).
 */
export function useInvoiceActions({
  detailForm,
  createForm,
  saveInvoiceApi,
  performActionApi,
  sendBulkRemindersApi,
  removeInvoiceApi,
  reloadInvoices,
  openDetail,
  closeDetail,
  customerOptions,
  selectedInvoice,
  setNotice,
  setError,
  setPendingConfirm
}: UseInvoiceActionsOptions) {
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });
  const [busyAction, setBusyAction] = useState<string | null>(null);

  /** Persists the editable detail dialog fields back to the invoice route. */
  async function saveInvoiceEdits() {
    if (!selectedInvoice) return;
    setBusyAction("save");
    setError("");

    const dueAt = dateTimeLocalToIso(detailForm.editingDueAt);
    if (!dueAt) {
      setBusyAction(null);
      setError("Please enter a valid due date and time.");
      return;
    }

    const lineItemsPayload = detailForm.editingLineItems.map((li) => ({
      id: li.id,
      kind: li.kind,
      description: li.description,
      quantity: li.quantityLocked ? 1 : Number.parseFloat(li.quantity) || 0,
      unitPriceCents: parseMoneyInputToCents(li.unitPriceInput, detailForm.resolvedEditingCurrency).cents || 0,
      taxMode: li.taxMode,
      discountKind: li.discountKind,
      discountValue: parseDiscountValueForCurrency(li.discountKind, li.discountValueInput, detailForm.resolvedEditingCurrency),
      // Preserve package linkage so re-saving an invoice keeps its credit-granting
      // package lines intact.
      packageId: li.packageId ?? null
    }));

    const result = await saveInvoiceApi(selectedInvoice.id, {
      notes: detailForm.editingNotes,
      dueAt,
      customerFirstName: detailForm.editingCustomerFirstName,
      customerLastName: detailForm.editingCustomerLastName,
      customerName: `${detailForm.editingCustomerFirstName} ${detailForm.editingCustomerLastName}`.trim(),
      paymentDetailsSource: detailForm.editingPaymentDetailsSource,
      ...(detailForm.editingPaymentDetailsSource === "custom"
        ? {
            bankName: detailForm.editingBankName,
            bankBsb: detailForm.editingBankBsb,
            bankAccountName: detailForm.editingBankAccountName,
            bankAccountNumber: detailForm.editingBankAccountNumber
          }
        : {}),
      currency: detailForm.resolvedEditingCurrency,
      discountKind: detailForm.editingDiscountKind,
      discountValue: parseDiscountValueForCurrency(detailForm.editingDiscountKind, detailForm.editingDiscountValueInput, detailForm.resolvedEditingCurrency),
      lineItems: lineItemsPayload
    });

    setBusyAction(null);
    if (result) {
      openDetail(result);
      setNotice("Invoice has been edited and not sent to the customer.");
      // RATIONALE: Refresh the backing list after saving so badges, totals, and
      // pagination rows stay aligned with whatever the server recalculated.
      reloadInvoices();
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
      reloadInvoices();
    }
  }

  /**
   * Creates a new invoice draft and optionally chains a send action.
   *
   * RATIONALE: Create-and-send is intentionally modelled as two steps so the UI
   * can still recover cleanly when creation succeeds but outbound email fails.
   */
  async function createInvoice(shouldSend: boolean = false) {
    const customer = customerOptions.find(c => c.id === createForm.createSelectedCustomerId);
    if (!customer) {
      setError("Please select a customer.");
      return;
    }

    const dueAt = createForm.createDueAt ? dateTimeLocalToIso(createForm.createDueAt) : new Date().toISOString();
    if (!dueAt) {
      setError("Please enter a valid due date and time.");
      return;
    }

    setBusyAction(shouldSend ? "create_send" : "create");
    setError("");
    if (createForm.createBlockingError) {
      setBusyAction(null);
      setError(createForm.createBlockingError);
      return;
    }

    const payload: Record<string, unknown> = {
      dueAt,
      currency: createForm.resolvedCreateCurrency,
      taxMode: createForm.createTaxMode,
      discountKind: createForm.createDiscountKind,
      discountValue: parseDiscountValueForCurrency(createForm.createDiscountKind, createForm.createDiscountValueInput, createForm.resolvedCreateCurrency)
    };

    if (createForm.createUsesBookingLessons) {
      payload.bookingIds = createForm.createSelectedBookingIds;
    }
    const directCreateLineItems = [
      ...createForm.createQuickLessonPreviewLineItems,
      ...createForm.createStandalonePreviewLineItems,
      ...createForm.createPresetPreviewLineItems,
      ...createForm.createPackagePreviewLineItems
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
        createForm.resetCreateDialog();
        createForm.setCreateOpen(false);
        setNotice(sentResult.notice || "Invoice created and sent to customer.");
        openDetail(sentResult.invoice);
        reloadInvoices();
      } else {
        createForm.resetCreateDialog();
        createForm.setCreateOpen(false);
        // RATIONALE: When email delivery fails, we still surface the draft so an
        // admin can inspect or resend it rather than losing the newly created document.
        setNotice("Invoice created but failed to send. Now open in draft.");
        openDetail(result);
        reloadInvoices();
      }
    } else {
      setBusyAction(null);
      if (result) {
        createForm.resetCreateDialog();
        createForm.setCreateOpen(false);
        setNotice("Invoice created.");
        openDetail(result);
        reloadInvoices();
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
      reloadInvoices();
    }
  }

  return {
    busyAction,
    setBusyAction,
    saveInvoiceEdits,
    performAction,
    createInvoice,
    sendBulkReminders,
    removeInvoiceApi,
    reloadInvoices
  };
}
