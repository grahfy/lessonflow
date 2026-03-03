"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminTable, AdminTableSeparator as Separator } from "@/components/admin/ui/admin-table";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { parseAudInputToCents } from "@/lib/invoices/currency";
import { DEFAULT_CURRENCY } from "@/lib/branding";
import { formatDateTime, toDateTimeLocalValue, toMoneyInput } from "@/lib/admin/formatters";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";

type InvoiceStatus = "draft" | "sent" | "paid" | "void";
type InvoiceTaxMode = "taxable" | "gst_free";

type InvoiceLineItem = {
  id: string;
  kind: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  taxCents: number;
  taxMode: InvoiceTaxMode;
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  documentType: "invoice" | "credit_note";
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  overdueDays: number | null;
  totalCents: number;
  currency: string;
  customerName: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail: string;
  customerId: string | null;
  notes: string | null;
  lineItems: InvoiceLineItem[];
};

type InvoicesResponse = {
  invoices: InvoiceRow[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
};

type ProductPreset = {
  id: string;
  label: string;
  description: string;
  unitPriceCents: number;
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

type CreateInvoiceBasis = "lesson_based" | "standalone";

function toCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency
  }).format(cents / 100);
}

/**
 * Admin invoices console client.
 * Refactored to use centralized UI components.
 */
export function AdminInvoicesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [outstandingOnly, setOutstandingOnly] = useState(false);

  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [editingDueAt, setEditingDueAt] = useState("");
  const [editingLineItems, setEditingLineItems] = useState<EditableLineItem[]>([]);
  const [presets, setPresets] = useState<ProductPreset[]>([]);
  const [editingProductPresetId, setEditingProductPresetId] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createCustomerOptions, setCreateCustomerOptions] = useState<Array<{ id: string; fullName: string; firstName: string; lastName: string }>>([]);
  const [createSelectedCustomerId, setCreateSelectedCustomerId] = useState("");
  const [createInvoiceBasis, setCreateInvoiceBasis] = useState<CreateInvoiceBasis>("lesson_based");
  const [createLessonPrice, setCreateLessonPrice] = useState("0.00");
  const [createStandalonePrice, setCreateStandalonePrice] = useState("0.00");
  const [createDueAt, setCreateDueAt] = useState("");
  const [createTaxMode, setCreateTaxMode] = useState<InvoiceTaxMode>("taxable");

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        q: query,
        outstanding: outstandingOnly ? "true" : "false"
      });
      const response = await safeFetch(`/api/admin/invoices?${params.toString()}`);
      if (!response) return;
      if (!response.ok) {
        await handleApiError(response, "Unable to load invoices.");
      }
      const data = await response.json() as InvoicesResponse;
      setInvoices(data.invoices);
      setTotalCount(data.totalCount);
      setTotalPages(data.totalPages);
    } catch {
      setError("Unable to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, query, outstandingOnly, safeFetch, handleApiError]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    async function loadPresets() {
      const response = await safeFetch("/api/admin/presets");
      if (response?.ok) {
        const data = await response.json() as { presets: ProductPreset[] };
        setPresets(data.presets);
      }
    }
    void loadPresets();
  }, [safeFetch]);

  useEffect(() => {
    async function loadCustomers() {
      const response = await safeFetch("/api/admin/customers/options");
      if (response?.ok) {
        const data = await response.json() as { customers: Array<{ id: string; fullName: string; firstName: string; lastName: string }> };
        setCreateCustomerOptions(data.customers);
      }
    }
    if (createOpen) void loadCustomers();
  }, [createOpen, safeFetch]);

  function openInvoice(invoice: InvoiceRow) {
    setError("");
    setNotice("");
    setSelectedInvoice(invoice);
    setEditingNotes(invoice.notes || "");
    setEditingDueAt(toDateTimeLocalValue(invoice.dueAt));
    setEditingLineItems(
      invoice.lineItems.map((li) => ({
        key: li.id,
        id: li.id,
        kind: li.kind,
        description: li.description,
        quantity: li.quantity.toString(),
        unitPriceAud: toMoneyInput(li.unitPriceCents),
        taxMode: li.taxMode
      }))
    );
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
      (li) => !li.description || Number.isNaN(li.quantity) || Number.isNaN(li.unitPriceCents)
    );
    if (invalid) {
      setError("Please ensure all line items have a description, quantity, and price.");
      return;
    }

    setBusyAction("save");
    try {
      const response = await safeFetch(`/api/admin/invoices/${selectedInvoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: editingNotes,
          dueAt: new Date(editingDueAt).toISOString(),
          lineItems: lineItemsPayload
        })
      });
      if (!response) return;
      if (!response.ok) {
        await handleApiError(response, "Unable to save invoice edits.");
      }
      const updated = await response.json() as InvoiceRow;
      setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
      setSelectedInvoice(updated);
      setNotice("Invoice saved successfully.");
    } catch {
      setError("Unable to save invoice edits.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runInvoiceAction(action: string, invoiceOverride?: InvoiceRow) {
    const target = invoiceOverride || selectedInvoice;
    if (!target) return;

    if (action === "delete" && !window.confirm("Permanently delete this invoice?")) return;
    if (action === "void" && !window.confirm("Void this invoice? This cannot be undone.")) return;

    if (action === "download_pdf") {
      window.open(`/api/admin/invoices/${target.id}/pdf`, "_blank");
      return;
    }

    setError("");
    setNotice("");
    setBusyAction(action);

    try {
      const response = await safeFetch(`/api/admin/invoices/${target.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      if (!response) return;
      if (!response.ok) {
        await handleApiError(response, `Unable to perform ${action}.`);
        return;
      }
      const updated = await response.json() as InvoiceRow;
      setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
      if (selectedInvoice?.id === updated.id) {
        setSelectedInvoice(updated);
      }
      setNotice(`${action.replace("_", " ").toUpperCase()} completed successfully.`);
    } catch {
      setError(`Unable to perform ${action}.`);
    } finally {
      setBusyAction(null);
    }
  }

  async function createInvoice() {
    if (!createSelectedCustomerId) {
      setError("Please select a customer.");
      return;
    }
    setError("");
    setNotice("");
    setBusyAction("create");

    try {
      const response = await safeFetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: createSelectedCustomerId,
          basis: createInvoiceBasis,
          priceCents: parseAudInputToCents(createInvoiceBasis === "lesson_based" ? createLessonPrice : createStandalonePrice),
          dueAt: createDueAt ? new Date(createDueAt).toISOString() : null,
          taxMode: createTaxMode
        })
      });
      if (!response) return;
      if (!response.ok) {
        await handleApiError(response, "Unable to create invoice.");
        return;
      }
      const newInvoice = await response.json() as InvoiceRow;
      setInvoices((prev) => [newInvoice, ...prev]);
      setCreateOpen(false);
      openInvoice(newInvoice);
      setNotice("Invoice created.");
    } catch {
      setError("Unable to create invoice.");
    } finally {
      setBusyAction(null);
    }
  }

  async function sendDueReminders() {
    if (!window.confirm("Send overdue reminders to all customers with invoices due or past due? This only sends to invoices at a higher reminder stage than previously sent.")) return;
    setError("");
    setNotice("");
    setBusyAction("bulk_reminders");

    try {
      const response = await safeFetch("/api/admin/invoices/bulk-reminders", { method: "POST" });
      if (!response) return;
      if (!response.ok) {
        await handleApiError(response, "Unable to send bulk reminders.");
        return;
      }
      const data = await response.json() as { count: number };
      setNotice(`Sent ${data.count} overdue reminders.`);
      void loadInvoices();
    } catch {
      setError("Unable to send bulk reminders.");
    } finally {
      setBusyAction(null);
    }
  }

  const subtotalCents = editingLineItems.reduce((acc, li) => acc + (Math.round(Number.parseFloat(li.unitPriceAud || "0") * 100) * Number.parseInt(li.quantity, 10)), 0);
  const taxableCents = editingLineItems.filter(li => li.taxMode === "taxable").reduce((acc, li) => acc + (Math.round(Number.parseFloat(li.unitPriceAud || "0") * 100) * Number.parseInt(li.quantity, 10)), 0);
  const gstCents = Math.round(taxableCents / 11);
  const totalCents = subtotalCents + gstCents;

  return (
    <AdminShell
      title="Invoice Console"
      error={error}
      notice={notice}
      loading={loading}
      style={{ height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      <AdminCard className="invoice-toolbar">
        <div className="field">
          <label>Search</label>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Invoice #, customer, email" />
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px' }}>
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
      </AdminCard>

      <AdminTable
        header={invoices.length ? (
          <>
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
          </>
        ) : null}
        loading={loading}
        emptyLabel="No invoices found matching filters."
        pagination={{
          currentPage: page,
          totalPages: totalPages,
          totalCount: totalCount,
          pageSize: pageSize,
          onPageChange: setPage,
          onPageSizeChange: (newSize) => {
            setPageSize(newSize);
            setPage(1);
          }
        }}
      >
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
      </AdminTable>

      <AdminDialog
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        title={selectedInvoice?.invoiceNumber || ""}
        wide
        description={selectedInvoice && `Invoice · Status ${selectedInvoice.status} · Issued ${formatDateTime(selectedInvoice.issuedAt)} · Due ${formatDateTime(selectedInvoice.dueAt)}`}
        footer={selectedInvoice && (
          <>
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
          </>
        )}
      >
        {selectedInvoice && (
          <>
            <div className="dialog-layout" style={{ marginTop: "12px" }}>
              <div className="dialog-col">
                <AdminForm>
                  <AdminField label="First Name">
                    <input value={selectedInvoice.customerFirstName || selectedInvoice.customerName.split(' ')[0]} readOnly />
                  </AdminField>
                  <AdminField label="Last Name">
                    <input value={selectedInvoice.customerLastName || selectedInvoice.customerName.split(' ').slice(1).join(' ')} readOnly />
                  </AdminField>
                  <AdminField label="Email" fullWidth>
                    <input value={selectedInvoice.customerEmail} readOnly />
                  </AdminField>
                  <AdminField label="Due At" fullWidth>
                    <input type="datetime-local" value={editingDueAt} onChange={e => setEditingDueAt(e.target.value)} />
                  </AdminField>
                </AdminForm>
              </div>
              <div className="dialog-col is-notes">
                <AdminField label="Notes">
                  <textarea
                    value={editingNotes}
                    onChange={e => setEditingNotes(e.target.value)}
                    placeholder="Internal or customer notes..."
                    className="dialog-notes"
                    style={{ minHeight: "100px" }}
                  />
                </AdminField>
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

            <div className="dialog-actions-row" style={{ display: "flex", gap: "8px", marginTop: "12px", alignItems: "flex-start" }}>
              {selectedInvoice.documentType !== "credit_note" && (
                <>
                  <button className="btn btn-secondary" onClick={addEditableLineItem}>ADD LINE ITEM</button>
                  <select className="btn btn-secondary" style={{ width: "auto" }} value={editingProductPresetId} onChange={e => addPresetToEditor(e.target.value)}>
                    <option value="">Add product preset...</option>
                    {presets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </>
              )}

              <div className="invoice-total-stack" style={{ marginLeft: "auto", textAlign: "right" }}>
                <div>Subtotal: {toCurrency(subtotalCents, selectedInvoice.currency)}</div>
                <div>GST: {toCurrency(gstCents, selectedInvoice.currency)}</div>
                <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--ink-0)" }}>Total: {toCurrency(totalCents, selectedInvoice.currency)}</div>
              </div>
            </div>
          </>
        )}
      </AdminDialog>

      <AdminDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Invoice"
        footer={(
          <button className="btn btn-primary" disabled={!!busyAction} onClick={() => void createInvoice()}>CREATE INVOICE</button>
        )}
      >
        <AdminForm>
          <AdminField label="Customer">
            <select value={createSelectedCustomerId} onChange={e => setCreateSelectedCustomerId(e.target.value)}>
              <option value="">Select customer</option>
              {createCustomerOptions.map(c => (
                <option key={c.id} value={c.id}>
                  {c.lastName ? `${c.lastName}, ${c.firstName}` : c.fullName}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Basis">
            <select value={createInvoiceBasis} onChange={e => setCreateInvoiceBasis(e.target.value as CreateInvoiceBasis)}>
              <option value="lesson_based">Lesson-based</option>
              <option value="standalone">Standalone</option>
            </select>
          </AdminField>
          <AdminField label={`Price (${DEFAULT_CURRENCY})`}>
            <input value={createInvoiceBasis === "lesson_based" ? createLessonPrice : createStandalonePrice} onChange={e => {
              if (createInvoiceBasis === "lesson_based") {
                setCreateLessonPrice(e.target.value);
              } else {
                setCreateStandalonePrice(e.target.value);
              }
            }} />
          </AdminField>
          <AdminField label="Due At">
            <input type="datetime-local" value={createDueAt} onChange={e => setCreateDueAt(e.target.value)} />
          </AdminField>
          <AdminField label="Tax Mode">
            <select value={createTaxMode} onChange={e => setCreateTaxMode(e.target.value as InvoiceTaxMode)}>
              <option value="taxable">Taxable (GST)</option>
              <option value="gst_free">GST Free</option>
            </select>
          </AdminField>
        </AdminForm>
      </AdminDialog>
    </AdminShell>
  );
}
