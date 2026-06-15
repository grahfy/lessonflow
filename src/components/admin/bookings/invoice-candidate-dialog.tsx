"use client";

import { AppDialog } from "@/components/ui/app-dialog";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { formatDateTime } from "@/lib/admin/formatters";
import { formatCurrency } from "@/lib/invoices/currency";
import { type BookingInvoiceCandidateSummary } from "@/lib/invoices/schema";

interface InvoiceCandidateDialogProps {
  candidates: BookingInvoiceCandidateSummary[];
  onClose: () => void;
  busy: boolean;
  canCreate: boolean;
  onOpenExisting: (invoiceId: string) => void;
  onCreateNew: () => void;
}

/**
 * Resolution dialog shown when a booking maps to one or more possible existing
 * invoices: the admin picks an existing invoice or creates a booking-linked draft.
 *
 * Presentational only — billing resolution and draft creation remain in the
 * bookings orchestrator so behavior stays identical to the pre-extraction JSX.
 */
export function InvoiceCandidateDialog({
  candidates,
  onClose,
  busy,
  canCreate,
  onOpenExisting,
  onCreateNew
}: InvoiceCandidateDialogProps) {
  return (
    <AppDialog
      isOpen={candidates.length > 0}
      onClose={onClose}
      size="md"
      title="Possible Existing Invoices"
      description="Choose an existing invoice for this booking or create a new booking-linked draft."
      footer={(
        <div className="dialog-footer-row dialog-footer-row-end">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || !canCreate}
            onClick={onCreateNew}
          >
            {busy ? "Creating..." : "Create New"}
          </button>
        </div>
      )}
    >
      <AdminCard ghost>
        {candidates.length === 0 ? (
          <p className="helper-text">No candidate invoices found.</p>
        ) : (
          <div className="invoice-dialog-preset-list">
            {candidates.map((candidate) => (
              <div key={candidate.invoiceId} className="invoice-dialog-preset-option">
                <div className="admin-list-strong">
                  {candidate.invoiceNumber} · {candidate.status}
                </div>
                <div className="helper-text">
                  Issued {formatDateTime(candidate.issuedAt)} · Due {formatDateTime(candidate.dueAt)} · {formatCurrency(candidate.totalCents, candidate.currency)}
                </div>
                <div className="helper-text">{candidate.matchReason}</div>
                <div className="button-row">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => onOpenExisting(candidate.invoiceId)}
                  >
                    Open Existing
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </AppDialog>
  );
}
