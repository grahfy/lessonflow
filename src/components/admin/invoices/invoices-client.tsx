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

import { useInvoices, type InvoiceRow, type InvoiceTaxMode } from "@/lib/admin/use-invoices";
import { usePresets } from "@/lib/admin/use-presets";
import { useCustomers } from "@/lib/admin/use-customers";

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
 * Refactored to use centralized UI components and hooks.
 */
export function AdminInvoicesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Search & Filter State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [outstandingOnly, setOutstandingOnly] = useState(false);

  // Dialog State
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [editingDueAt, setEditingDueAt] = useState("");
  const [editingLineItems, setEditingLineItems] = useState<EditableLineItem[]>([]);
  const [editingProductPresetId, setEditingProductPresetId] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createSelectedCustomerId, setCreateSelectedCustomerId] = useState("");
  const [createInvoiceBasis, setCreateInvoiceBasis] = useState<CreateInvoiceBasis>("lesson_based");
  const [createLessonPrice, setCreateLessonPrice] = useState("0.00");
  const [createStandalonePrice, setCreateStandalonePrice] = useState("0.00");
  const [createDueAt, setCreateDueAt] = useState("");
  const [createTaxMode, setCreateTaxMode] = useState<InvoiceTaxMode>("taxable");

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
    sendBulkReminders: sendBulkRemindersApi 
  } = useInvoices({
    pageSize,
    onError: setError,
    onAuthError: () => window.location.assign("/admin/login")
  });

  const { presets } = usePresets({ onError: setError });
  const { customers: customerOptions, load: loadCustomers } = useCustomers({ pageSize: 1000 });

  // Effects
  useEffect(() => {
    void loadInvoices(query, page, outstandingOnly);
  }, [query, page, outstandingOnly, loadInvoices]);

  // Actions
  const openDetail = (invoice: InvoiceRow) => {
    setSelectedInvoice(invoice);
    setEditingNotes(invoice.notes || "");
    setEditingDueAt(toDateTimeLocalValue(invoice.dueAt));
    setEditingLineItems(
      invoice.lineItems.map((li) => ({
        key: li.id,
        id: li.id,
        kind: li.kind,
        description: li.description,
        quantity: String(li.quantity),
        unitPriceAud: toMoneyInput(li.unitPriceCents),
        taxMode: li.taxMode
      }))
    );
    setNotice("");
    setError("");
  };

  const closeDetail = () => setSelectedInvoice(null);

  const addLineItem = () => {
    setEditingLineItems((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        kind: "custom",
        description: "",
        quantity: "1",
        unitPriceAud: "0.00",
        taxMode: "taxable"
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
        unitPriceAud: toMoneyInput(preset.unitPriceCents),
        taxMode: "taxable",
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

  async function saveInvoiceEdits() {
    if (!selectedInvoice) return;
    setBusyAction("save");
    setError("");

    const lineItemsPayload = editingLineItems.map((li) => ({
      id: li.id,
      kind: li.kind,
      description: li.description,
      quantity: Number.parseFloat(li.quantity) || 0,
      unitPriceCents: parseAudInputToCents(li.unitPriceAud).cents || 0,
      taxMode: li.taxMode
    }));

    const result = await saveInvoiceApi(selectedInvoice.id, {
      notes: editingNotes,
      dueAt: new Date(editingDueAt).toISOString(),
      lineItems: lineItemsPayload as any
    });

    setBusyAction(null);
    if (result) {
      setSelectedInvoice(result);
      setNotice("Invoice saved successfully.");
      void loadInvoices(query, page, outstandingOnly);
    }
  }

  async function performAction(action: string) {
    if (!selectedInvoice) return;
    if (action === "void" && !window.confirm("Are you sure you want to void this invoice? This cannot be undone.")) return;

    setBusyAction(action);
    setError("");
    const result = await performActionApi(selectedInvoice.id, action);
    setBusyAction(null);

    if (result) {
      setSelectedInvoice(result);
      setNotice(`Action '${action}' completed.`);
      void loadInvoices(query, page, outstandingOnly);
    }
  }

  async function createInvoice() {
    if (!createSelectedCustomerId) {
      setError("Please select a customer.");
      return;
    }
    setBusyAction("create");
    setError("");

    const payload = {
      customerId: createSelectedCustomerId,
      basis: createInvoiceBasis,
      lessonPriceCents: parseAudInputToCents(createLessonPrice).cents || 0,
      standalonePriceCents: parseAudInputToCents(createStandalonePrice).cents || 0,
      dueAt: createDueAt ? new Date(createDueAt).toISOString() : undefined,
      taxMode: createTaxMode
    };

    const result = await createInvoiceApi(payload);
    setBusyAction(null);

    if (result) {
      setCreateOpen(false);
      setNotice("Invoice created.");
      void loadInvoices(query, page, outstandingOnly);
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
      void loadInvoices(query, page, outstandingOnly);
    }
  }

  const header = (
    <>
      <div style={{ width: '100px', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Number</div>
      <Separator />
      <div style={{ flex: '1', minWidth: '150px', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Customer</div>
      <Separator />
      <div style={{ width: '100px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Status</div>
      <Separator />
      <div style={{ width: '120px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Total</div>
      <Separator />
      <div style={{ width: '120px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Due Date</div>
    </>
  );

  return (
    <AdminShell title="Invoices" error={error} notice={notice}>
      <div className="admin-actions-bar">
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-primary" onClick={() => { setCreateOpen(true); void loadCustomers(); }}>
            CREATE INVOICE
          </button>
          <button className="btn btn-secondary" disabled={busyAction === 'bulk-reminders'} onClick={sendBulkReminders}>
            {busyAction === 'bulk-reminders' ? "SENDING..." : "SEND OVERDUE REMINDERS"}
          </button>
        </div>

        <div className="search-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={outstandingOnly} onChange={(e) => { setOutstandingOnly(e.target.checked); setPage(1); }} />
              Outstanding only
            </label>
            <input
              type="text"
              value={query}
              placeholder="Search by number or customer..."
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            />
          </div>
        </div>
      </div>

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
          <div key={inv.id} className="invoice-row-item" onClick={() => openDetail(inv)}>
            <div style={{ width: '100px', fontWeight: 600 }}>{inv.invoiceNumber}</div>
            <Separator />
            <div style={{ flex: '1', minWidth: '150px' }}>
              <div style={{ fontWeight: 500 }}>{inv.customerName}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-1)' }}>{inv.customerEmail}</div>
            </div>
            <Separator />
            <div style={{ width: '100px', textAlign: 'center' }}>
              <span className={`status-badge status-${inv.status}`}>{inv.status}</span>
            </div>
            <Separator />
            <div style={{ width: '120px', textAlign: 'right', fontWeight: 600 }}>
              {toCurrency(inv.totalCents, inv.currency)}
            </div>
            <Separator />
            <div style={{ width: '120px', textAlign: 'right', fontSize: '0.85rem' }}>
              {new Date(inv.dueAt).toLocaleDateString("en-AU")}
              {inv.overdueDays !== null && inv.status !== "paid" && inv.status !== "void" && (
                <div style={{ color: 'var(--red)', fontSize: '0.7rem', fontWeight: 600 }}>{inv.overdueDays} DAYS OVERDUE</div>
              )}
            </div>
          </div>
        ))}
      </AdminTable>

      <AdminDialog
        isOpen={!!selectedInvoice}
        onClose={closeDetail}
        title={`Invoice ${selectedInvoice?.invoiceNumber}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeDetail}>CLOSE</button>
            {selectedInvoice?.status === 'draft' && (
              <button className="btn btn-primary" disabled={!!busyAction} onClick={() => void performAction('send')}>
                {busyAction === 'send' ? 'SENDING...' : 'SEND TO CUSTOMER'}
              </button>
            )}
            {selectedInvoice?.status === 'sent' && (
              <button className="btn btn-primary" disabled={!!busyAction} onClick={() => void performAction('mark_paid')}>
                {busyAction === 'mark_paid' ? 'SAVING...' : 'MARK AS PAID'}
              </button>
            )}
            {selectedInvoice && (selectedInvoice.status === 'sent' || selectedInvoice.status === 'paid') && (
              <button className="btn btn-danger" disabled={!!busyAction} onClick={() => void performAction('void')}>
                {busyAction === 'void' ? 'VOIDING...' : 'VOID INVOICE'}
              </button>
            )}
          </>
        }
      >
        {selectedInvoice && (
          <div className="dialog-layout">
            <div className="dialog-col">
              <h4>Invoice Details</h4>
              <AdminCard style={{ marginBottom: '16px' }}>
                <AdminForm className="dialog-form-grid">
                  <AdminField label="Customer">
                    <input value={selectedInvoice.customerName} readOnly />
                  </AdminField>
                  <AdminField label="Email">
                    <input value={selectedInvoice.customerEmail} readOnly />
                  </AdminField>
                  <AdminField label="Due Date">
                    <input type="datetime-local" value={editingDueAt} onChange={(e) => setEditingDueAt(e.target.value)} />
                  </AdminField>
                  <AdminField label="Notes" fullWidth>
                    <textarea value={editingNotes} onChange={(e) => setEditingNotes(e.target.value)} placeholder="Customer-facing notes..." />
                  </AdminField>
                </AdminForm>
                <div className="button-row" style={{ marginTop: '12px' }}>
                  <button className="btn btn-secondary" disabled={!!busyAction} onClick={saveInvoiceEdits}>
                    {busyAction === 'save' ? 'SAVING...' : 'SAVE BASIC DETAILS'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => router.push(`/admin/customers?customerId=${selectedInvoice.customerId}`)}>VIEW CUSTOMER</button>
                </div>
              </AdminCard>

              <h4>Line Items</h4>
              <AdminCard>
                <div style={{ display: 'grid', gap: '12px' }}>
                  {editingLineItems.map((li) => (
                    <div key={li.key} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <AdminField label="Description">
                          <input value={li.description} onChange={(e) => updateLineItem(li.key, { description: e.target.value })} />
                        </AdminField>
                      </div>
                      <div style={{ width: '60px' }}>
                        <AdminField label="Qty">
                          <input type="number" value={li.quantity} onChange={(e) => updateLineItem(li.key, { quantity: e.target.value })} />
                        </AdminField>
                      </div>
                      <div style={{ width: '100px' }}>
                        <AdminField label="Price">
                          <input value={li.unitPriceAud} onChange={(e) => updateLineItem(li.key, { unitPriceAud: e.target.value })} />
                        </AdminField>
                      </div>
                      <button className="btn btn-danger" style={{ marginTop: '24px', padding: '8px' }} onClick={() => removeLineItem(li.key)}>×</button>
                    </div>
                  ))}
                  <div className="button-row" style={{ marginTop: '8px' }}>
                    <button className="btn btn-secondary" onClick={addLineItem}>+ ADD CUSTOM ITEM</button>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select value={editingProductPresetId} onChange={(e) => addPresetToInvoice(e.target.value)}>
                        <option value="">+ ADD FROM PRESET...</option>
                        {presets.map(p => <option key={p.id} value={p.id}>{p.label} ({toCurrency(p.unitPriceCents, DEFAULT_CURRENCY)})</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </AdminCard>
            </div>

            <div className="dialog-col is-notes">
              <h4>Actions & History</h4>
              <AdminCard style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid var(--line)' }}>
                <p className="helper-text">Manage the lifecycle of this invoice.</p>
                <div className="button-row" style={{ flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                  <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => window.open(`/api/admin/invoices/${selectedInvoice.id}/pdf`, '_blank')}>VIEW PDF</button>
                  {selectedInvoice.status !== 'void' && (
                    <button className="btn btn-secondary" style={{ width: '100%' }} disabled={!!busyAction} onClick={() => void performAction('send')}>
                      RESEND NOTIFICATION
                    </button>
                  )}
                </div>
              </AdminCard>
            </div>
          </div>
        )}
      </AdminDialog>

      <AdminDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New Invoice"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>CANCEL</button>
            <button className="btn btn-primary" disabled={!!busyAction || !createSelectedCustomerId} onClick={createInvoice}>
              {busyAction === 'create' ? 'CREATING...' : 'CREATE INVOICE'}
            </button>
          </>
        }
      >
        <AdminForm className="dialog-form-grid">
          <AdminField label="Select Customer" fullWidth required>
            <select value={createSelectedCustomerId} onChange={(e) => setCreateSelectedCustomerId(e.target.value)}>
              <option value="">-- Choose student --</option>
              {customerOptions.map(c => <option key={c.id} value={c.id}>{c.lastName ? `${c.lastName}, ${c.firstName}` : c.fullName}</option>)}
            </select>
          </AdminField>
          <AdminField label="Invoice Basis">
            <select value={createInvoiceBasis} onChange={(e) => setCreateInvoiceBasis(e.target.value as CreateInvoiceBasis)}>
              <option value="lesson_based">Lessons (Calculated from bookings)</option>
              <option value="standalone">Standalone (Manual line items)</option>
            </select>
          </AdminField>
          <AdminField label="Tax Mode">
            <select value={createTaxMode} onChange={(e) => setCreateTaxMode(e.target.value as InvoiceTaxMode)}>
              <option value="taxable">Taxable (standard)</option>
              <option value="gst_free">GST Free</option>
            </select>
          </AdminField>
          {createInvoiceBasis === 'lesson_based' ? (
            <AdminField label="Lesson Rate (AUD)">
              <input value={createLessonPrice} onChange={(e) => setCreateLessonPrice(e.target.value)} />
            </AdminField>
          ) : (
            <AdminField label="Initial Item Price (AUD)">
              <input value={createStandalonePrice} onChange={(e) => setCreateStandalonePrice(e.target.value)} />
            </AdminField>
          )}
          <AdminField label="Due Date (Optional)">
            <input type="datetime-local" value={createDueAt} onChange={(e) => setCreateDueAt(e.target.value)} />
          </AdminField>
        </AdminForm>
      </AdminDialog>
    </AdminShell>
  );
}
