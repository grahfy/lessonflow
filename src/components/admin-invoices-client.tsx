"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { Pagination } from "@/components/pagination";
import { parseAudInputToCents } from "@/lib/invoices/currency";
import { DEFAULT_CURRENCY } from "@/lib/branding";
import { formatDateTime, toDateTimeLocalValue, toMoneyInput } from "@/lib/admin/formatters";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";

type InvoiceStatus = "draft" | "sent" | "paid" | "void";
type InvoiceTaxMode = "taxable" | "gst_free";
type InvoiceDocumentType = "invoice" | "credit_note";
type AgingBucket = "all" | "current" | "overdue_1_30" | "overdue_31_plus";

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
  id?: string;
  kind: string;
  description: string;
  quantity: string;
  unitPriceAud: string;
  taxMode: InvoiceTaxMode;
  isPreset?: boolean;
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  documentType: InvoiceDocumentType;
  taxMode: InvoiceTaxMode;
  currency: string;
  customerId: string | null;
  originalInvoiceId: string | null;
  customerFirstName: string;
  customerLastName: string;
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
  lineItems: InvoiceLineItem[];
};

type CreateCustomerOption = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
};

type CreateInvoiceBasis = "lesson_based" | "standalone";

type InvoiceProductPreset = {
  id: string;
  label: string;
  description: string;
  unitPriceCents: number;
};

/**
 * Main admin invoices surface for list filters, lifecycle actions, reminders, and create flows.
 */
function toCurrency(cents: number, currency: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency
  }).format(cents / 100);
}

interface CustomerListResponse {
  customers: CreateCustomerOption[];
}

interface InvoiceListResponse {
  invoices: InvoiceRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Main admin invoices surface for search, reminder, and lifecycle actions.
 */
export function AdminInvoicesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState<"" | InvoiceStatus>("");
  const [agingFilter, setAgingFilter] = useState<AgingBucket>("all");
  const [outstandingOnly, setOutstandingOnly] = useState(false);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [editingDueAt, setEditingDueAt] = useState("");
  const [editingLineItems, setEditingLineItems] = useState<EditableLineItem[]>([]);
  const [editingProductPresetId, setEditingProductPresetId] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [presets, setPresets] = useState<InvoiceProductPreset[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createCustomerOptions, setCreateCustomerOptions] = useState<CreateCustomerOption[]>([]);
  const [createSelectedCustomerId, setCreateSelectedCustomerId] = useState("");
  const [createInvoiceBasis, setCreateInvoiceBasis] = useState<CreateInvoiceBasis>("lesson_based");
  const [createLessonPrice, setCreateLessonPrice] = useState("");
  const [createStandalonePrice, setCreateStandalonePrice] = useState("");
  const [createDueAt, setCreateDueAt] = useState(toDateTimeLocalValue(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()));
  const [createTaxMode, setCreateTaxMode] = useState<InvoiceTaxMode>("taxable");

  const { safeFetch, handleApiError } = useSafeFetch({
    onError: setError
  });

  const loadInvoices = useCallback(async (): Promise<InvoiceRow[]> => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (agingFilter !== "all") params.set("agingBucket", agingFilter);
    if (outstandingOnly) params.set("outstanding", "true");
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    const response = await safeFetch(`/api/admin/invoices?${params.toString()}`, { cache: "no-store" });
    setLoading(false);
    if (!response.ok) {
      await handleApiError(response, "Unable to load invoices.");
      return [];
    }

    const payload = (await response.json()) as InvoiceListResponse;
    const rows = payload.invoices || [];
    setInvoices(rows);
    setTotalCount(payload.total || 0);
    setTotalPages(payload.totalPages || 1);
    return rows;
  }, [agingFilter, handleApiError, outstandingOnly, page, pageSize, query, safeFetch, statusFilter]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, agingFilter, outstandingOnly]);

  // Sync search params to local state if they change
  useEffect(() => {
    const q = searchParams.get("q");
    if (q !== null && q !== query) {
      setQuery(q);
    }
  }, [searchParams, query]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await safeFetch("/api/admin/presets");
        if (response.ok) {
          const body = await response.json();
          setPresets(body.presets || []);
        }
      } catch {
        // Silent failure
      }
    })();
  }, [safeFetch]);

  useEffect(() => {
    if (!createOpen) return;
    void (async () => {
      const response = await safeFetch("/api/admin/customers?limit=100", { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json() as CustomerListResponse;
        setCreateCustomerOptions(payload.customers || []);
      }
    })();
  }, [createOpen, safeFetch]);

  function openInvoice(invoice: InvoiceRow) {
    setSelectedInvoice(invoice);
    setEditingNotes(invoice.notes || "");
    setEditingDueAt(toDateTimeLocalValue(invoice.dueAt));
    setEditingLineItems(
      invoice.lineItems.map((lineItem, idx) => ({
        key: `${lineItem.id}-${idx}`,
        id: lineItem.id,
        kind: lineItem.kind,
        description: lineItem.description,
        quantity: String(lineItem.quantity),
        unitPriceAud: toMoneyInput(lineItem.unitPriceCents),
        taxMode: lineItem.taxMode
      }))
    );
    setError("");
  }

  function addEditableLineItem() {
    setEditingLineItems((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        kind: "custom",
        description: "",
        quantity: "1",
        unitPriceAud: "0.00",
        taxMode: "taxable"
      }
    ]);
  }

  function removeEditableLineItem(key: string) {
    setEditingLineItems((prev) => prev.filter((item) => item.key !== key));
  }

  function updateEditableLineItem(key: string, patch: Partial<EditableLineItem>) {
    setEditingLineItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addPresetToEditor(presetId: string) {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    setEditingLineItems((prev) => [
      ...prev,
      {
        key: `preset-${preset.id}-${Date.now()}-${prev.length}`,
        kind: "custom",
        description: preset.description,
        quantity: "1",
        unitPriceAud: toMoneyInput(preset.unitPriceCents),
        taxMode: "taxable",
        isPreset: true
      }
    ]);
    setEditingProductPresetId("");
  }

  async function saveInvoiceEdits() {
    if (!selectedInvoice) return;
    setNotice("");

    const lineItemsPayload = editingLineItems.map((lineItem, index) => {
      const quantity = Number.parseInt(lineItem.quantity, 10);
      const unitPriceCents = Math.round(Number.parseFloat(lineItem.unitPriceAud || "0") * 100);
      return {
        id: lineItem.id, // existing items have an ID
        kind: lineItem.kind,
        description: lineItem.description.trim(),
        quantity,
        unitPriceCents,
        taxMode: lineItem.taxMode,
        sortOrder: index
      };
    });

    const invalid = lineItemsPayload.some(
      (lineItem) =>
        !lineItem.description ||
        !Number.isFinite(lineItem.quantity) ||
        lineItem.quantity < 1 ||
        !Number.isFinite(lineItem.unitPriceCents) ||
        (selectedInvoice.documentType === "invoice" && lineItem.unitPriceCents < 0)
    );

    if (invalid) {
      setError(selectedInvoice.documentType === "invoice"
        ? "Each line item needs description, quantity >= 1, and unit price >= 0."
        : "Each line item needs description and quantity >= 1."
      );
      return;
    }

    const isCreditNote = selectedInvoice.documentType === "credit_note";

    const body: { action: string; notes: string | null; dueAt: string; lineItems?: typeof lineItemsPayload } = {
      action: "edit",
      notes: editingNotes.trim() || null,
      dueAt: new Date(editingDueAt).toISOString(),
    };

    if (!isCreditNote) {
      body.lineItems = lineItemsPayload;
    }

    setBusyAction("save");
    setError("");
    const response = await safeFetch(`/api/admin/invoices/${selectedInvoice.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    setBusyAction(null);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "Unable to save invoice.");
      return;
    }

    setNotice("Invoice updated.");
    const updatedRows = await loadInvoices();
    const updated = updatedRows.find(r => r.id === selectedInvoice.id);
    if (updated) {
      openInvoice(updated);
    } else {
      // If the invoice is no longer in the filtered list, close the dialog
      // so the user isn't looking at stale data that "disappeared" from the background.
      setSelectedInvoice(null);
    }
  }

  async function runInvoiceAction(action: string, invoiceOverride?: InvoiceRow) {
    const invoice = invoiceOverride ?? selectedInvoice;
    if (!invoice) return;

    if (action === "delete" && !window.confirm("Delete this record permanently?")) return;
    if (action === "void" && !window.confirm("Void this invoice? This cannot be undone.")) return;

    setBusyAction(action);
    setError("");

    let endpoint = `/api/admin/invoices/${invoice.id}`;
    let method = "PATCH";
    let body: string | undefined;

    if (action === "send") {
      endpoint = `/api/admin/invoices/${invoice.id}/send`;
      method = "POST";
    } else if (action === "send_reminder") {
      endpoint = `/api/admin/invoices/${invoice.id}/reminder`;
      method = "POST";
    } else if (action === "download_pdf") {
      window.open(`/api/admin/invoices/${invoice.id}/pdf`, "_blank");
      setBusyAction(null);
      setNotice("PDF download initiated.");
      return;
    } else if (action === "delete") {
      method = "DELETE";
    } else if (action === "mark_paid") {
      body = JSON.stringify({ action: "mark_paid" });
    } else if (action === "mark_unpaid") {
      body = JSON.stringify({ action: "mark_unpaid" });
    } else if (action === "void") {
      body = JSON.stringify({ action: "void" });
    } else if (action === "create_credit_note") {
      body = JSON.stringify({ action: "create_credit_note" });
    }

    const response = await safeFetch(endpoint, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body
    });

    setBusyAction(null);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "Action failed.");
      return;
    }

    const payload = await response.json().catch(() => ({}));

    if (action === "delete") {
      setNotice("Invoice deleted.");
      if (selectedInvoice?.id === invoice.id) setSelectedInvoice(null);
      await loadInvoices();
    } else if (action === "create_credit_note" && payload.creditNoteId) {
      setNotice("Credit note created.");
      router.push(`/admin/invoices?invoiceId=${payload.creditNoteId}`);
      await loadInvoices();
    } else {
      setNotice(payload.message || "Action complete.");
      const updatedRows = await loadInvoices();
      const updated = updatedRows.find(r => r.id === invoice.id);
      if (updated && selectedInvoice?.id === invoice.id) {
        openInvoice(updated);
      } else if (selectedInvoice?.id === invoice.id) {
        setSelectedInvoice(null);
      }
    }
  }

  async function sendDueReminders() {
    if (!window.confirm("Send automated overdue reminders to all eligible customers?")) return;

    setBusyAction("bulk_reminders");
    setError("");
    const response = await safeFetch("/api/admin/invoices/reminders", { method: "POST" });
    setBusyAction(null);

    if (!response.ok) {
      setError("Failed to send reminders.");
      return;
    }

    const payload = await response.json();
    setNotice(payload.message || "Bulk reminders complete.");
    await loadInvoices();
  }

  async function createInvoice() {
    setError("");
    setNotice("");
    if (!createSelectedCustomerId) {
      setError("Select a customer.");
      return;
    }

    const lineItems: { kind: string; description: string; quantity: number; unitPriceCents: number; taxMode: InvoiceTaxMode; sortOrder: number; }[] = [];
    if (createInvoiceBasis === "lesson_based") {
      const lessonPrice = parseAudInputToCents(createLessonPrice);
      if (lessonPrice.cents !== null) {
        lineItems.push({ kind: "lesson_fee", description: "Lesson fee", quantity: 1, unitPriceCents: lessonPrice.cents, taxMode: createTaxMode, sortOrder: 0 });
      }
    } else {
      const standalonePrice = parseAudInputToCents(createStandalonePrice);
      if (standalonePrice.cents !== null) {
        lineItems.push({ kind: "custom", description: "Service", quantity: 1, unitPriceCents: standalonePrice.cents, taxMode: createTaxMode, sortOrder: 0 });
      }
    }

    if (!lineItems.length) {
      setError("Add at least one item.");
      return;
    }

    setBusyAction("create");
    const response = await safeFetch(`/api/admin/customers/${createSelectedCustomerId}/invoices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taxMode: createTaxMode,
        dueAt: new Date(createDueAt).toISOString(),
        lineItems
      })
    });
    setBusyAction(null);
    if (!response.ok) {
      setError("Failed to create invoice.");
      return;
    }

    const payload = await response.json();
    setCreateOpen(false);
    setNotice("Invoice created.");
    await loadInvoices();
    if (payload.invoice?.id) {
      const updatedRows = await loadInvoices();
      const created = updatedRows.find(r => r.id === payload.invoice.id);
      if (created) openInvoice(created);
    }
  }

  const subtotalCents = editingLineItems.reduce((acc, item) => {
    const qty = Number.parseInt(item.quantity, 10) || 0;
    const price = Math.round(Number.parseFloat(item.unitPriceAud || "0") * 100);
    return acc + (qty * price);
  }, 0);

  const gstCents = editingLineItems.reduce((acc, item) => {
    if (item.taxMode !== "taxable") return acc;
    const qty = Number.parseInt(item.quantity, 10) || 0;
    const price = Math.round(Number.parseFloat(item.unitPriceAud || "0") * 100);
    // GST is 10% on top of unit price based on calculate.ts logic
    return acc + Math.round((qty * price) * 0.1);
  }, 0);

  const totalCents = subtotalCents + gstCents;

  const Separator = () => <div style={{ width: '1px', height: '24px', background: 'var(--line)', flexShrink: 0 }} />;

  return (
    <AdminShell
      title="Invoice Console"
      error={error}
      notice={notice}
      loading={loading}
      style={{ height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
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
          <select value={agingFilter} onChange={(event) => setAgingFilter(event.target.value as AgingBucket)}>
            <option value="all">All</option>
            <option value="current">Current</option>
            <option value="overdue_1_30">Overdue (1-30d)</option>
            <option value="overdue_31_plus">Overdue (31d+)</option>
          </select>
        </div>
        <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', paddingBottom: '10px' }}>
          <input
            type="checkbox"
            id="outstandingOnly"
            checked={outstandingOnly}
            onChange={e => setOutstandingOnly(e.target.checked)}
          />
          <label htmlFor="outstandingOnly" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>Outstanding only</label>
        </div>
        <button className="btn btn-secondary" onClick={() => void loadInvoices()}>REFRESH</button>
        <button className="btn btn-secondary" disabled={busyAction === "bulk_reminders"} onClick={() => void sendDueReminders()}>SEND DUE REMINDERS</button>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>CREATE INVOICE</button>
      </div>

      <div className="admin-card invoice-list-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {invoices.length ? (
          <div className="customer-item invoice-item invoice-list-header" style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              gap: '12px',
              width: '100%',
              border: 'none',
              borderBottom: '1px solid var(--line)',
              background: 'rgba(8, 11, 28, 0.84)',
              borderRadius: 0,
              flexShrink: 0
            }}>
              <div style={{ minWidth: '125px', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Invoice #</div>
              <Separator />
              <div style={{ flex: '1.2', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Customer</div>
              <Separator />
              <div style={{ width: '100px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Aging</div>
              <Separator />
              <div style={{ width: '120px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Due Date</div>
              <Separator />
              <div style={{ minWidth: '220px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Status / Total</div>
              <Separator />
              <div style={{ width: '280px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Actions</div>
            </div>
        ) : null}
        <div className="customers-list" style={{ flex: 1, overflowY: 'auto', maxHeight: 'none', gap: '0', padding: 0, background: 'rgba(8, 11, 28, 0.84)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0', padding: '0' }}>
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="customer-item invoice-item"
style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  gap: '12px',
                  width: '100%',
                  borderRadius: 0,
                  border: 'none',
                  borderBottom: '1px solid var(--line)',
                  minHeight: '52px',
                  cursor: 'pointer',
                  background: 'rgba(8, 11, 28, 0.84)'
                }}
                onClick={() => openInvoice(invoice)}
              >
                <div style={{ minWidth: '125px', fontWeight: 700, fontSize: '0.85rem', textAlign: 'left' }}>{invoice.invoiceNumber}</div>

                <Separator />
                <div style={{ flex: '1.2', fontWeight: 600, color: 'var(--ink-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem', textAlign: 'left' }}>
                  {invoice.customerLastName ? `${invoice.customerLastName}, ${invoice.customerFirstName}` : invoice.customerName}
                </div>

                <Separator />
                <div style={{ width: '100px', color: 'var(--ink-1)', fontSize: '0.8rem', textAlign: 'center' }}>
                  {invoice.overdueDays && invoice.overdueDays > 0 ? `Overdue ${invoice.overdueDays}d` : "Current"}
                </div>

                <Separator />
                <div style={{ width: '120px', color: 'var(--ink-1)', fontSize: '0.8rem', textAlign: 'center' }}>
                  Due {new Date(invoice.dueAt).toLocaleDateString("en-AU")}
                </div>

                <Separator />
                <div className="invoice-item-summary-inline" style={{ minWidth: '220px', justifyContent: 'center', textAlign: 'center', display: 'flex', gap: '4px' }}>
                  <span className="invoice-item-chip" style={{ fontSize: '0.8rem' }}>Invoice</span>
                  <span className={`invoice-item-chip invoice-item-chip-status invoice-item-chip-status-${invoice.status}`} style={{ fontSize: '0.8rem' }}>{invoice.status}</span>
                  <span className="invoice-item-chip invoice-item-chip-total" style={{ fontSize: '0.8rem' }}>{toCurrency(invoice.totalCents, invoice.currency)}</span>
                </div>

                <Separator />

                <div className="invoice-item-primary-actions" style={{ width: '280px', display: 'flex', justifyContent: 'flex-end', gap: '6px' }} onClick={e => e.stopPropagation()}>
                  <button type="button" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.7rem', minWidth: '0', flex: '1' }} onClick={() => openInvoice(invoice)}>VIEW</button>
                  <button type="button" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.7rem', minWidth: '0', flex: '1' }} onClick={() => void runInvoiceAction("download_pdf", invoice)}>PDF</button>
                  <button type="button" className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '0.7rem', minWidth: '0', flex: '1' }} onClick={() => void runInvoiceAction("delete", invoice)}>DEL</button>
                </div>
              </div>
            ))}
            {!loading && invoices.length === 0 && <p className="helper-text" style={{ padding: '20px' }}>No invoices found matching filters.</p>}
          </div>
        </div>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          totalCount={totalCount}
        />
      </div>

      {selectedInvoice ? (
        <div className="dialog-backdrop" onClick={() => setSelectedInvoice(null)}>
          <div className="dialog-panel dialog-panel-wide" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-head">
              <h3>{selectedInvoice.invoiceNumber}</h3>
              <button className="btn btn-secondary" onClick={() => setSelectedInvoice(null)}>CLOSE</button>
            </div>

            {error ? <p className="notice error" style={{ margin: '12px 0 0 0' }}>{error}</p> : null}
            {notice ? <p className="notice success" style={{ margin: '12px 0 0 0' }}>{notice}</p> : null}

            <div className="dialog-status">
              Invoice · Status <strong>{selectedInvoice.status}</strong> · Issued {formatDateTime(selectedInvoice.issuedAt)} · Due {formatDateTime(selectedInvoice.dueAt)}
            </div>

            <div className="dialog-layout" style={{ marginTop: "12px" }}>
              <div className="dialog-col">
                <div className="form-grid">
                  <div className="field">
                    <label>First Name</label>
                    <input value={selectedInvoice.customerFirstName || selectedInvoice.customerName.split(' ')[0]} readOnly />
                  </div>
                  <div className="field">
                    <label>Last Name</label>
                    <input value={selectedInvoice.customerLastName || selectedInvoice.customerName.split(' ').slice(1).join(' ')} readOnly />
                  </div>
                  <div className="field full">
                    <label>Email</label>
                    <input value={selectedInvoice.customerEmail} readOnly />
                  </div>
                  <div className="field full">
                    <label>Due At</label>
                    <input type="datetime-local" value={editingDueAt} onChange={e => setEditingDueAt(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="dialog-col is-notes">
                <div className="field">
                  <label>Notes</label>
                  <textarea
                    value={editingNotes}
                    onChange={e => setEditingNotes(e.target.value)}
                    placeholder="Internal or customer notes..."
                    className="dialog-notes"
                    style={{ minHeight: "100px" }}
                  />
                </div>
              </div>
            </div>

            <div className="invoice-line-list">
              {editingLineItems.map((lineItem) => (
                <div key={lineItem.key} className="invoice-line-item invoice-line-item-editable">
                  <input
                    value={lineItem.description}
                    placeholder="Line item description"
                    readOnly={selectedInvoice.documentType === "credit_note"}
                    onChange={e => updateEditableLineItem(lineItem.key, { description: e.target.value })}
                  />
                  <input
                    type="number"
                    style={{ width: "60px" }}
                    value={lineItem.quantity}
                    readOnly={selectedInvoice.documentType === "credit_note"}
                    onChange={e => updateEditableLineItem(lineItem.key, { quantity: e.target.value })}
                  />
                  <input
                    style={{ width: "100px" }}
                    value={lineItem.unitPriceAud}
                    readOnly={selectedInvoice.documentType === "credit_note"}
                    onChange={e => updateEditableLineItem(lineItem.key, { unitPriceAud: e.target.value })}
                  />
                  <select
                    value={lineItem.taxMode}
                    disabled={selectedInvoice.documentType === "credit_note"}
                    onChange={e => updateEditableLineItem(lineItem.key, { taxMode: e.target.value as InvoiceTaxMode })}
                  >
                    <option value="taxable">Taxable (GST)</option>
                    <option value="gst_free">GST Free</option>
                  </select>
                  {selectedInvoice.documentType !== "credit_note" && (
                    <button className="btn btn-danger" style={{ padding: "4px 8px", fontSize: "0.7rem" }} onClick={() => removeEditableLineItem(lineItem.key)}>REMOVE</button>
                  )}
                </div>
              ))}
            </div>

            {selectedInvoice.documentType !== "credit_note" && (
              <div className="dialog-actions-row" style={{ display: "flex", gap: "8px", marginTop: "12px", alignItems: "flex-start" }}>
                <button className="btn btn-secondary" onClick={addEditableLineItem}>ADD LINE ITEM</button>
                <select className="btn btn-secondary" style={{ width: "auto" }} value={editingProductPresetId} onChange={e => addPresetToEditor(e.target.value)}>
                  <option value="">Add product preset...</option>
                  {presets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>

                <div className="invoice-total-stack" style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div>Subtotal: {toCurrency(subtotalCents, selectedInvoice.currency)}</div>
                  <div>GST: {toCurrency(gstCents, selectedInvoice.currency)}</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--ink-0)" }}>Total: {toCurrency(totalCents, selectedInvoice.currency)}</div>
                </div>
              </div>
            )}

            {selectedInvoice.documentType === "credit_note" && (
              <div className="dialog-actions-row" style={{ display: "flex", gap: "8px", marginTop: "12px", alignItems: "flex-start" }}>
                <div className="invoice-total-stack" style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div>Subtotal: {toCurrency(subtotalCents, selectedInvoice.currency)}</div>
                  <div>GST: {toCurrency(gstCents, selectedInvoice.currency)}</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--ink-0)" }}>Total: {toCurrency(totalCents, selectedInvoice.currency)}</div>
                </div>
              </div>
            )}

            <div className="dialog-actions" style={{ marginTop: "20px", paddingTop: "15px" }}>
              <button className="btn btn-primary" disabled={busyAction === "save"} onClick={() => void saveInvoiceEdits()}>SAVE</button>
              <button className="btn btn-secondary" disabled={busyAction === "send"} onClick={() => void runInvoiceAction("send")}>SEND</button>
              <button className="btn btn-secondary" onClick={() => void runInvoiceAction("download_pdf")}>DOWNLOAD PDF</button>
              <button className="btn btn-secondary" disabled={busyAction === "send_reminder"} onClick={() => void runInvoiceAction("send_reminder")}>SEND REMINDER</button>
              <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void runInvoiceAction("mark_paid")}>MARK PAID</button>
              <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void runInvoiceAction("mark_unpaid")}>MARK UNPAID</button>
              <button className="btn btn-secondary" disabled={!!busyAction} onClick={() => void runInvoiceAction("create_credit_note")}>CREATE CREDIT NOTE</button>
              <button className="btn btn-danger" disabled={!!busyAction} onClick={() => void runInvoiceAction("void")}>VOID</button>
              <button className="btn btn-danger" disabled={!!busyAction} onClick={() => void runInvoiceAction("delete")}>DELETE</button>
              {selectedInvoice?.customerId ? (
                <button className="btn btn-secondary" onClick={() => router.push(`/admin/customers?customerId=${selectedInvoice.customerId}`)}>VIEW CUSTOMER</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="dialog-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="dialog-panel" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-head">
              <h3>Create Invoice</h3>
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>CLOSE</button>
            </div>

            {error ? <p className="notice error" style={{ margin: '12px 0 0 0' }}>{error}</p> : null}
            {notice ? <p className="notice success" style={{ margin: '12px 0 0 0' }}>{notice}</p> : null}

            <div className="form-grid">
              <div className="field">
                <label>Customer</label>
                <select value={createSelectedCustomerId} onChange={e => setCreateSelectedCustomerId(e.target.value)}>
                  <option value="">Select customer</option>
                  {createCustomerOptions.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.lastName ? `${c.lastName}, ${c.firstName}` : c.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Basis</label>
                <select value={createInvoiceBasis} onChange={e => setCreateInvoiceBasis(e.target.value as CreateInvoiceBasis)}>
                  <option value="lesson_based">Lesson-based</option>
                  <option value="standalone">Standalone</option>
                </select>
              </div>
              <div className="field">
                <label>Price ({DEFAULT_CURRENCY})</label>
                <input value={createInvoiceBasis === "lesson_based" ? createLessonPrice : createStandalonePrice} onChange={e => {
                  if (createInvoiceBasis === "lesson_based") {
                    setCreateLessonPrice(e.target.value);
                  } else {
                    setCreateStandalonePrice(e.target.value);
                  }
                }} />
              </div>
              <div className="field">
                <label>Due At</label>
                <input type="datetime-local" value={createDueAt} onChange={e => setCreateDueAt(e.target.value)} />
              </div>
              <div className="field">
                <label>Tax Mode</label>
                <select value={createTaxMode} onChange={e => setCreateTaxMode(e.target.value as InvoiceTaxMode)}>
                  <option value="taxable">Taxable (GST)</option>
                  <option value="gst_free">GST Free</option>
                </select>
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-primary" disabled={!!busyAction} onClick={() => void createInvoice()}>CREATE INVOICE</button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
