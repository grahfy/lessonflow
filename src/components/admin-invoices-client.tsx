"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type InvoiceStatus = "draft" | "sent" | "paid" | "void";
type InvoiceTaxMode = "taxable" | "gst_free";
type InvoiceDocumentType = "invoice" | "credit_note";
type InvoiceAgingBucket = "current" | "overdue_1_30" | "overdue_31_plus";

type InvoiceLineItem = {
  id: string;
  kind: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxMode: InvoiceTaxMode;
  lineSubtotalCents: number;
  lineGstCents: number;
  lineTotalCents: number;
  sortOrder: number;
};

type EditableLineItem = {
  key: string;
  kind: "lesson_fee" | "educational_books" | "digital_guitar_lessons" | "custom";
  description: string;
  quantity: string;
  unitPriceAud: string;
  taxMode: InvoiceTaxMode;
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  documentType: InvoiceDocumentType;
  taxMode: InvoiceTaxMode;
  customerId: string | null;
  originalInvoiceId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  notes: string | null;
  issuedAt: string;
  dueAt: string;
  sentAt: string | null;
  paidAt: string | null;
  lastReminderSentAt: string | null;
  lastReminderStage: number | null;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  overdueDays?: number;
  agingBucket?: InvoiceAgingBucket;
  lineItems: InvoiceLineItem[];
};

function toCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(cents / 100);
}

function toDateInputValue(value: Date): string {
  return value.toISOString().slice(0, 16);
}

function toMoneyInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function describeAging(bucket?: InvoiceAgingBucket): string {
  if (bucket === "overdue_1_30") {
    return "Overdue 1-30";
  }
  if (bucket === "overdue_31_plus") {
    return "Overdue 31+";
  }
  return "Current";
}

/**
 * Main admin invoices surface for search, reminder, and lifecycle actions.
 */
export function AdminInvoicesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerFilter = searchParams.get("customerId") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | InvoiceStatus>("");
  const [agingFilter, setAgingFilter] = useState<"" | InvoiceAgingBucket>("");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [editingDueAt, setEditingDueAt] = useState("");
  const [editingLineItems, setEditingLineItems] = useState<EditableLineItem[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createCustomerName, setCreateCustomerName] = useState("");
  const [createCustomerEmail, setCreateCustomerEmail] = useState("");
  const [createCustomerPhone, setCreateCustomerPhone] = useState("");
  const [createCustomerAddress, setCreateCustomerAddress] = useState("");
  const [createLessonPrice, setCreateLessonPrice] = useState("");
  const [createBooksPrice, setCreateBooksPrice] = useState("");
  const [createDigitalPrice, setCreateDigitalPrice] = useState("");
  const [createCustomLabel, setCreateCustomLabel] = useState("");
  const [createCustomPrice, setCreateCustomPrice] = useState("");
  const [createDueAt, setCreateDueAt] = useState(toDateInputValue(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)));
  const [createTaxMode, setCreateTaxMode] = useState<InvoiceTaxMode>("taxable");

  /**
   * Loads invoices for the current filter set and returns rows for follow-up state sync.
   */
  const loadInvoices = useCallback(async (): Promise<InvoiceRow[]> => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (statusFilter) {
      params.set("status", statusFilter);
    }
    if (agingFilter) {
      params.set("agingBucket", agingFilter);
    }
    if (outstandingOnly) {
      params.set("outstanding", "true");
    }
    if (customerFilter) {
      params.set("customerId", customerFilter);
    }
    params.set("pageSize", "100");

    const response = await fetch(`/api/admin/invoices?${params.toString()}`, { cache: "no-store" });
    setLoading(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Unable to load invoices.");
      return [];
    }

    const payload = (await response.json()) as { invoices: InvoiceRow[] };
    const rows = payload.invoices || [];
    setInvoices(rows);
    return rows;
  }, [agingFilter, customerFilter, outstandingOnly, query, statusFilter]);

  useEffect(() => {
    loadInvoices().catch((cause) => setError(cause instanceof Error ? cause.message : "Load failed"));
  }, [loadInvoices]);

  const selectedSummary = useMemo(() => {
    if (!selectedInvoice) {
      return null;
    }
    return {
      issuedAt: new Date(selectedInvoice.issuedAt).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" }),
      dueAt: new Date(selectedInvoice.dueAt).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })
    };
  }, [selectedInvoice]);

  /**
   * Signs out current admin from invoices screen.
   */
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  /**
   * Seeds editor state from invoice data so line-items can be modified in-place.
   */
  function openInvoice(invoice: InvoiceRow) {
    setSelectedInvoice(invoice);
    setEditingNotes(invoice.notes || "");
    setEditingDueAt(toDateInputValue(new Date(invoice.dueAt)));
    setEditingLineItems(
      invoice.lineItems.map((lineItem, index) => ({
        key: `${lineItem.id}-${index}`,
        kind:
          lineItem.kind === "lesson_fee" ||
          lineItem.kind === "educational_books" ||
          lineItem.kind === "digital_guitar_lessons" ||
          lineItem.kind === "custom"
            ? lineItem.kind
            : "custom",
        description: lineItem.description,
        quantity: String(lineItem.quantity),
        unitPriceAud: toMoneyInput(lineItem.unitPriceCents),
        taxMode: lineItem.taxMode
      }))
    );
    setError("");
  }

  /**
   * Adds a custom line item for quick ad-hoc adjustments.
   */
  function addEditableLineItem() {
    setEditingLineItems((previous) => [
      ...previous,
      {
        key: `new-${Date.now()}-${previous.length}`,
        kind: "custom",
        description: "",
        quantity: "1",
        unitPriceAud: "0.00",
        taxMode: selectedInvoice?.taxMode ?? "taxable"
      }
    ]);
  }

  /**
   * Converts line-item form data into API payload while guarding against bad input.
   */
  function buildLineItemsPayload():
    | Array<{
        kind: "lesson_fee" | "educational_books" | "digital_guitar_lessons" | "custom";
        description: string;
        quantity: number;
        unitPriceCents: number;
        taxMode: InvoiceTaxMode;
        sortOrder: number;
      }>
    | null {
    const mapped = editingLineItems.map((lineItem, index) => {
      const quantity = Number.parseInt(lineItem.quantity, 10);
      const unitPriceCents = Math.round(Number.parseFloat(lineItem.unitPriceAud || "0") * 100);
      return {
        kind: lineItem.kind,
        description: lineItem.description.trim(),
        quantity,
        unitPriceCents,
        taxMode: lineItem.taxMode,
        sortOrder: index
      };
    });

    const invalid = mapped.some(
      (lineItem) => !lineItem.description || !Number.isFinite(lineItem.quantity) || lineItem.quantity < 1 || !Number.isFinite(lineItem.unitPriceCents) || lineItem.unitPriceCents < 0
    );

    if (invalid || mapped.length < 1) {
      setError("Each line item needs description, quantity >= 1, and unit price >= 0.");
      return null;
    }

    return mapped;
  }

  /**
   * Persists invoice edits including notes, due date, and editable line items.
   */
  async function saveInvoiceEdits() {
    if (!selectedInvoice) {
      return;
    }

    let lineItemsPayload:
      | Array<{
          kind: "lesson_fee" | "educational_books" | "digital_guitar_lessons" | "custom";
          description: string;
          quantity: number;
          unitPriceCents: number;
          taxMode: InvoiceTaxMode;
          sortOrder: number;
        }>
      | undefined;

    if (selectedInvoice.documentType === "invoice") {
      lineItemsPayload = buildLineItemsPayload() || undefined;
      if (!lineItemsPayload) {
        return;
      }
    }

    setBusyAction("save");
    const response = await fetch(`/api/admin/invoices/${selectedInvoice.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        notes: editingNotes,
        dueAt: new Date(editingDueAt).toISOString(),
        lineItems: lineItemsPayload
      })
    });
    setBusyAction(null);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Unable to save invoice.");
      return;
    }

    const refreshedRows = await loadInvoices();
    const refreshed = refreshedRows.find((invoice) => invoice.id === selectedInvoice.id);
    if (refreshed) {
      openInvoice(refreshed);
    }
    setNotice("Invoice updated.");
  }

  /**
   * Applies lifecycle and communication actions on selected invoice.
   */
  async function runInvoiceAction(action: "mark_paid" | "mark_unpaid" | "void" | "send" | "delete" | "remind" | "create_credit_note") {
    if (!selectedInvoice) {
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm("Delete this invoice record? This action is best reserved for draft/error records.");
      if (!confirmed) {
        return;
      }
    }

    const creditNoteReason =
      action === "create_credit_note"
        ? window.prompt("Reason for credit note (optional):", "")?.trim()
        : undefined;

    setBusyAction(action);

    const endpoint =
      action === "send"
        ? `/api/admin/invoices/${selectedInvoice.id}/send`
        : action === "delete"
          ? `/api/admin/invoices/${selectedInvoice.id}`
          : action === "remind"
            ? `/api/admin/invoices/${selectedInvoice.id}/remind`
            : action === "create_credit_note"
              ? `/api/admin/invoices/${selectedInvoice.id}/credit-note`
              : `/api/admin/invoices/${selectedInvoice.id}`;

    const method = action === "send" || action === "remind" || action === "create_credit_note" ? "POST" : action === "delete" ? "DELETE" : "PATCH";

    const body =
      action === "mark_paid" || action === "mark_unpaid" || action === "void"
        ? JSON.stringify({ action })
        : action === "create_credit_note"
          ? JSON.stringify({ reason: creditNoteReason || undefined })
          : undefined;

    const response = await fetch(endpoint, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body
    });

    setBusyAction(null);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Invoice action failed.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as { invoice?: InvoiceRow; sentCount?: number } | null;
    const refreshedRows = await loadInvoices();

    if (action === "delete") {
      setSelectedInvoice(null);
    } else if (action === "create_credit_note" && payload?.invoice) {
      openInvoice(payload.invoice);
    } else {
      const refreshed = refreshedRows.find((invoice) => invoice.id === selectedInvoice.id);
      if (refreshed) {
        openInvoice(refreshed);
      }
    }

    setNotice(
      action === "send"
        ? "Invoice sent."
        : action === "mark_paid"
          ? "Invoice marked as paid."
          : action === "mark_unpaid"
            ? "Invoice marked as unpaid."
            : action === "void"
              ? "Invoice voided."
              : action === "remind"
                ? "Reminder email sent."
                : action === "create_credit_note"
                  ? "Credit note created."
                  : "Invoice deleted."
    );
  }

  /**
   * Sends all currently eligible overdue reminders in one admin action.
   */
  async function sendBulkReminders() {
    setBusyAction("bulk_reminders");
    const response = await fetch("/api/admin/invoices/reminders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        maxInvoices: 100,
        customerId: customerFilter || undefined
      })
    });
    setBusyAction(null);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Unable to send reminders.");
      return;
    }

    const payload = (await response.json()) as { sentCount: number; eligibleCount: number; failedCount: number };
    setNotice(
      `Reminder run complete. Sent ${payload.sentCount} of ${payload.eligibleCount} eligible invoices${
        payload.failedCount ? ` (${payload.failedCount} failed)` : ""
      }.`
    );
    await loadInvoices();
  }

  /**
   * Opens the server PDF endpoint in a separate tab to trigger download.
   */
  function downloadInvoicePdf(invoiceId: string) {
    window.open(`/api/admin/invoices/${invoiceId}/pdf`, "_blank", "noopener,noreferrer");
  }

  /**
   * Creates a new invoice using temporary catalog fields and optional customer scope.
   */
  async function createInvoice() {
    const lessonCents = Math.round(Number.parseFloat(createLessonPrice || "0") * 100);
    if (!customerFilter && (!createCustomerName.trim() || !createCustomerEmail.trim() || !createCustomerPhone.trim() || !createCustomerAddress.trim())) {
      setError("Customer name, email, phone, and address are required.");
      return;
    }
    if (!Number.isFinite(lessonCents) || lessonCents < 0) {
      setError("Lesson price is required.");
      return;
    }

    const lineItems: Array<{
      kind: "lesson_fee" | "educational_books" | "digital_guitar_lessons" | "custom";
      description: string;
      quantity: number;
      unitPriceCents: number;
      taxMode: InvoiceTaxMode;
      sortOrder: number;
    }> = [
      {
        kind: "lesson_fee",
        description: "Lesson fee",
        quantity: 1,
        unitPriceCents: lessonCents,
        taxMode: createTaxMode,
        sortOrder: 0
      }
    ];

    const booksCents = Math.round(Number.parseFloat(createBooksPrice || "0") * 100);
    if (Number.isFinite(booksCents) && booksCents > 0) {
      lineItems.push({
        kind: "educational_books",
        description: "Educational books",
        quantity: 1,
        unitPriceCents: booksCents,
        taxMode: createTaxMode,
        sortOrder: lineItems.length
      });
    }

    const digitalCents = Math.round(Number.parseFloat(createDigitalPrice || "0") * 100);
    if (Number.isFinite(digitalCents) && digitalCents > 0) {
      lineItems.push({
        kind: "digital_guitar_lessons",
        description: "Digital guitar lessons",
        quantity: 1,
        unitPriceCents: digitalCents,
        taxMode: createTaxMode,
        sortOrder: lineItems.length
      });
    }

    const customCents = Math.round(Number.parseFloat(createCustomPrice || "0") * 100);
    if (createCustomLabel.trim() && Number.isFinite(customCents) && customCents > 0) {
      lineItems.push({
        kind: "custom",
        description: createCustomLabel.trim(),
        quantity: 1,
        unitPriceCents: customCents,
        taxMode: createTaxMode,
        sortOrder: lineItems.length
      });
    }

    setBusyAction("create");
    const endpoint = customerFilter ? `/api/admin/customers/${customerFilter}/invoices` : "/api/admin/invoices";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        customerFilter
          ? {
              taxMode: createTaxMode,
              dueAt: new Date(createDueAt).toISOString(),
              lineItems
            }
          : {
              customerName: createCustomerName.trim(),
              customerEmail: createCustomerEmail.trim(),
              customerPhone: createCustomerPhone.trim(),
              customerAddress: createCustomerAddress.trim(),
              taxMode: createTaxMode,
              dueAt: new Date(createDueAt).toISOString(),
              lineItems
            }
      )
    });
    setBusyAction(null);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Unable to create invoice.");
      return;
    }

    const payload = (await response.json()) as { invoice: InvoiceRow };
    setCreateOpen(false);
    setNotice("Invoice created.");
    openInvoice(payload.invoice);
    await loadInvoices();
  }

  return (
    <div className="admin-shell">
      <div className="admin-card booking-row admin-header-row">
        <h1 className="admin-console-title">Invoice Console</h1>
        <div className="booking-row">
          <button className="btn btn-secondary" onClick={() => router.push("/admin/bookings")}>Bookings</button>
          <button className="btn btn-secondary" onClick={() => void logout()}>Sign out</button>
        </div>
      </div>

      <div className="admin-card invoice-toolbar">
        <div className="field">
          <label>Search</label>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Invoice #, customer, email" />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | InvoiceStatus)}>
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        </div>
        <div className="field">
          <label>Aging</label>
          <select value={agingFilter} onChange={(event) => setAgingFilter(event.target.value as "" | InvoiceAgingBucket)}>
            <option value="">All</option>
            <option value="current">Current</option>
            <option value="overdue_1_30">Overdue 1-30</option>
            <option value="overdue_31_plus">Overdue 31+</option>
          </select>
        </div>
        <label className="helper-toggle">
          <input type="checkbox" checked={outstandingOnly} onChange={(event) => setOutstandingOnly(event.target.checked)} /> Outstanding only
        </label>
        <button className="btn btn-secondary" onClick={() => void loadInvoices()}>Refresh</button>
        <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void sendBulkReminders()}>
          {busyAction === "bulk_reminders" ? "Sending..." : "Send Due Reminders"}
        </button>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>Create Invoice</button>
      </div>

      <p className="helper-text">
        GST guidance: private lesson GST treatment can vary by business setup. Keep your default tax mode aligned with accountant advice.
      </p>

      {error ? <p className="notice error">{error}</p> : null}
      {notice ? <p className="notice success">{notice}</p> : null}
      {loading ? <p className="notice">Loading...</p> : null}

      <div className="admin-card invoice-list-card">
        <p className="helper-text customers-count">{invoices.length} invoice{invoices.length === 1 ? "" : "s"}</p>
        <div className="customers-list">
          {invoices.length ? (
            invoices.map((invoice) => (
              <div key={invoice.id} className="customer-item invoice-item">
                <div className="customer-item-meta">
                  <strong>{invoice.invoiceNumber} - {invoice.customerName}</strong>
                  <span><small>Type</small> {invoice.documentType === "credit_note" ? "Credit note" : "Invoice"}</span>
                  <span><small>Status</small> {invoice.status}</span>
                  <span><small>Total</small> {toCurrency(invoice.totalCents)}</span>
                  <span><small>Aging</small> {describeAging(invoice.agingBucket)}{invoice.overdueDays ? ` (${invoice.overdueDays}d)` : ""}</span>
                  <span><small>Due</small> {new Date(invoice.dueAt).toLocaleDateString("en-AU", { timeZone: "Australia/Melbourne" })}</span>
                </div>
                <div className="customer-item-actions">
                  <button className="btn btn-secondary" onClick={() => openInvoice(invoice)}>View</button>
                  <button className="btn btn-secondary" onClick={() => downloadInvoicePdf(invoice.id)}>Download PDF</button>
                </div>
              </div>
            ))
          ) : (
            <p className="helper-text">No invoices found.</p>
          )}
        </div>
      </div>

      {selectedInvoice ? (
        <div className="dialog-backdrop" onClick={() => setSelectedInvoice(null)}>
          <div className="dialog-panel dialog-panel-wide" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-head">
              <h3>{selectedInvoice.invoiceNumber}</h3>
              <button className="btn btn-secondary" onClick={() => setSelectedInvoice(null)}>Close</button>
            </div>
            {selectedSummary ? (
              <p className="helper-text dialog-status">
                {selectedInvoice.documentType === "credit_note" ? "Credit note" : "Invoice"} · Status <strong>{selectedInvoice.status}</strong> · Issued {selectedSummary.issuedAt} · Due {selectedSummary.dueAt}
              </p>
            ) : null}
            <div className="manual-grid manual-grid-2">
              <div className="field">
                <label>Customer</label>
                <input value={selectedInvoice.customerName} readOnly />
              </div>
              <div className="field">
                <label>Email</label>
                <input value={selectedInvoice.customerEmail} readOnly />
              </div>
              <div className="field">
                <label>Due At</label>
                <input type="datetime-local" value={editingDueAt} onChange={(event) => setEditingDueAt(event.target.value)} />
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea value={editingNotes} onChange={(event) => setEditingNotes(event.target.value)} />
              </div>
            </div>

            <div className="invoice-line-list">
              {editingLineItems.map((lineItem, index) => (
                <div key={lineItem.key} className="invoice-line-item invoice-line-item-editable">
                  <input
                    value={lineItem.description}
                    onChange={(event) =>
                      setEditingLineItems((previous) =>
                        previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, description: event.target.value } : entry))
                      )
                    }
                    readOnly={selectedInvoice.documentType === "credit_note"}
                    placeholder="Description"
                  />
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={lineItem.quantity}
                    onChange={(event) =>
                      setEditingLineItems((previous) =>
                        previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, quantity: event.target.value } : entry))
                      )
                    }
                    readOnly={selectedInvoice.documentType === "credit_note"}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={lineItem.unitPriceAud}
                    onChange={(event) =>
                      setEditingLineItems((previous) =>
                        previous.map((entry, entryIndex) => (entryIndex === index ? { ...entry, unitPriceAud: event.target.value } : entry))
                      )
                    }
                    readOnly={selectedInvoice.documentType === "credit_note"}
                  />
                  <select
                    value={lineItem.taxMode}
                    onChange={(event) =>
                      setEditingLineItems((previous) =>
                        previous.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, taxMode: event.target.value as InvoiceTaxMode } : entry
                        )
                      )
                    }
                    disabled={selectedInvoice.documentType === "credit_note"}
                  >
                    <option value="taxable">Taxable (GST)</option>
                    <option value="gst_free">GST-free</option>
                  </select>
                  <button
                    className="btn btn-secondary"
                    disabled={selectedInvoice.documentType === "credit_note" || editingLineItems.length <= 1}
                    onClick={() =>
                      setEditingLineItems((previous) => previous.filter((_, entryIndex) => entryIndex !== index))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {selectedInvoice.documentType === "invoice" ? (
              <div className="dialog-actions dialog-actions-inline">
                <button className="btn btn-secondary" onClick={() => addEditableLineItem()}>Add line item</button>
              </div>
            ) : null}

            <div className="invoice-total-stack">
              <span>Subtotal: {toCurrency(selectedInvoice.subtotalCents)}</span>
              <span>GST: {toCurrency(selectedInvoice.gstCents)}</span>
              <strong>Total: {toCurrency(selectedInvoice.totalCents)}</strong>
            </div>

            <div className="dialog-actions">
              <button className="btn btn-primary" disabled={!!busyAction} onClick={() => void saveInvoiceEdits()}>
                {busyAction === "save" ? "Saving..." : "Save"}
              </button>
              <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void runInvoiceAction("send")}>
                {busyAction === "send" ? "Sending..." : "Send"}
              </button>
              <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => downloadInvoicePdf(selectedInvoice.id)}>
                Download PDF
              </button>
              <button
                className="btn btn-secondary"
                disabled={!!busyAction || selectedInvoice.status !== "sent" || (selectedInvoice.overdueDays || 0) < 1}
                onClick={() => void runInvoiceAction("remind")}
              >
                {busyAction === "remind" ? "Sending reminder..." : "Send reminder"}
              </button>
              <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void runInvoiceAction("mark_paid")}>
                Mark paid
              </button>
              <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void runInvoiceAction("mark_unpaid")}>
                Mark unpaid
              </button>
              <button className="btn btn-secondary" disabled={!!busyAction || selectedInvoice.documentType !== "invoice" || (selectedInvoice.status !== "sent" && selectedInvoice.status !== "paid")} onClick={() => void runInvoiceAction("create_credit_note")}>
                {busyAction === "create_credit_note" ? "Creating..." : "Create credit note"}
              </button>
              <button className="btn btn-danger" disabled={!!busyAction} onClick={() => void runInvoiceAction("void")}>
                Void
              </button>
              <button
                className="btn btn-danger"
                disabled={!!busyAction || (selectedInvoice.documentType === "invoice" && (selectedInvoice.status === "sent" || selectedInvoice.status === "paid"))}
                onClick={() => void runInvoiceAction("delete")}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="dialog-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="dialog-panel dialog-panel-wide" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-head">
              <h3>Create Invoice</h3>
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Close</button>
            </div>
            <p className="helper-text dialog-status">
              Enter lesson pricing and temporary extras. Amounts are in dollars and converted to cents on save.
            </p>
            <div className="manual-grid manual-grid-2">
              <div className="field">
                <label>Customer name</label>
                <input value={createCustomerName} onChange={(event) => setCreateCustomerName(event.target.value)} />
              </div>
              <div className="field">
                <label>Customer email</label>
                <input type="email" value={createCustomerEmail} onChange={(event) => setCreateCustomerEmail(event.target.value)} />
              </div>
              <div className="field">
                <label>Customer phone</label>
                <input value={createCustomerPhone} onChange={(event) => setCreateCustomerPhone(event.target.value)} />
              </div>
              <div className="field">
                <label>Customer address</label>
                <input value={createCustomerAddress} onChange={(event) => setCreateCustomerAddress(event.target.value)} />
              </div>
              <div className="field">
                <label>Lesson fee (AUD)</label>
                <input value={createLessonPrice} onChange={(event) => setCreateLessonPrice(event.target.value)} />
              </div>
              <div className="field">
                <label>Educational books (optional)</label>
                <input value={createBooksPrice} onChange={(event) => setCreateBooksPrice(event.target.value)} />
              </div>
              <div className="field">
                <label>Digital guitar lessons (optional)</label>
                <input value={createDigitalPrice} onChange={(event) => setCreateDigitalPrice(event.target.value)} />
              </div>
              <div className="field">
                <label>Custom charge label</label>
                <input value={createCustomLabel} onChange={(event) => setCreateCustomLabel(event.target.value)} />
              </div>
              <div className="field">
                <label>Custom charge amount (optional)</label>
                <input value={createCustomPrice} onChange={(event) => setCreateCustomPrice(event.target.value)} />
              </div>
              <div className="field">
                <label>Due at</label>
                <input type="datetime-local" value={createDueAt} onChange={(event) => setCreateDueAt(event.target.value)} />
              </div>
              <div className="field">
                <label>Tax mode</label>
                <select value={createTaxMode} onChange={(event) => setCreateTaxMode(event.target.value as InvoiceTaxMode)}>
                  <option value="taxable">Taxable (GST)</option>
                  <option value="gst_free">GST-free</option>
                </select>
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!!busyAction} onClick={() => void createInvoice()}>
                {busyAction === "create" ? "Creating..." : "Create invoice"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
