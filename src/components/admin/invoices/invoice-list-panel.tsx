"use client";

import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminTable, AdminTableSeparator as Separator } from "@/components/admin/ui/admin-table";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { type InvoiceRow } from "@/lib/admin/use-invoices";
import { type InvoiceSortBy, type InvoiceSortDirection } from "@/lib/invoices/schema";
import { getDisplayStatus, toCurrency } from "@/lib/invoices/invoice-display-helpers";
import { type PendingConfirm } from "@/lib/admin/use-invoice-actions";

interface InvoiceListPanelProps {
  invoices: InvoiceRow[];
  loading: boolean;
  isInvoicesWorkspaceLoading: boolean;
  totalCount: number;
  totalPages: number;
  draftVisibleCount: number;
  overdueVisibleCount: number;
  visibleOpenBalanceCents: number;
  defaultCurrency: string;
  busyAction: string | null;

  overdueOnly: boolean;
  setOverdueOnly: (value: boolean) => void;
  query: string;
  setQuery: (value: string) => void;
  sortBy: InvoiceSortBy;
  setSortBy: (value: InvoiceSortBy) => void;
  sortDir: InvoiceSortDirection;
  setSortDir: (updater: (prev: InvoiceSortDirection) => InvoiceSortDirection) => void;
  page: number;
  setPage: (value: number) => void;
  pageSize: number;
  setPageSize: (value: number) => void;

  searchInputId: string;
  sortSelectId: string;
  overdueFilterId: string;

  onCreateInvoice: () => void;
  onSendBulkReminders: () => void;
  onOpenDetail: (invoice: InvoiceRow) => void;
  setPendingConfirm: (value: PendingConfirm | null) => void;
  setBusyAction: (value: string | null) => void;
  removeInvoiceApi: (id: string) => Promise<boolean>;
  reloadInvoices: () => void;
}

/**
 * Invoice workspace toolbar plus the paginated invoice table.
 *
 * RATIONALE: The list surface owns its own search/sort/pagination affordances
 * and row-level actions, leaving the orchestrator to coordinate dialogs and
 * cross-surface state.
 */
export function InvoiceListPanel({
  invoices,
  loading,
  isInvoicesWorkspaceLoading,
  totalCount,
  totalPages,
  draftVisibleCount,
  overdueVisibleCount,
  visibleOpenBalanceCents,
  defaultCurrency,
  busyAction,
  overdueOnly,
  setOverdueOnly,
  query,
  setQuery,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  page,
  setPage,
  pageSize,
  setPageSize,
  searchInputId,
  sortSelectId,
  overdueFilterId,
  onCreateInvoice,
  onSendBulkReminders,
  onOpenDetail,
  setPendingConfirm,
  setBusyAction,
  removeInvoiceApi,
  reloadInvoices
}: InvoiceListPanelProps) {
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
    <>
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
              <button className="btn btn-primary" type="button" onClick={onCreateInvoice}>
                Create Invoice
              </button>
            </Tooltip>
            <Tooltip content="Send reminders for all eligible overdue invoices in one action.">
              <button className="btn btn-secondary" type="button" disabled={busyAction === 'bulk-reminders'} onClick={onSendBulkReminders}>
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
            onClick={() => onOpenDetail(inv)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenDetail(inv);
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
                  onClick={() => onOpenDetail(inv)}
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
                        reloadInvoices();
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
    </>
  );
}
