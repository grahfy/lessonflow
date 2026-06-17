"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminCard } from "@/components/admin/ui/admin-card";
import type { InvoiceRow } from "@/lib/admin/use-invoices";
import { formatCurrency } from "@/lib/invoices/currency";

/**
 * Self-contained admin panel for applying a customer's account credit to an
 * invoice. Shows the available balance and a one-click "Apply" button that
 * posts to the dedicated apply-credit endpoint, then hands the updated invoice
 * back to the parent so the dialog + list re-hydrate.
 *
 * Kept as its own island (rather than threaded through the invoice lifecycle
 * action union) so the vouchers/account-credit feature stays additive and does
 * not entangle the invoice edit/lifecycle FSM.
 */
export function InvoiceAccountCreditPanel({
  invoice,
  canApply,
  onApplied,
}: {
  invoice: InvoiceRow;
  /** False for paid/void invoices where credit cannot be applied. */
  canApply: boolean;
  /** Called with the updated invoice after a successful application. */
  onApplied: (updated: InvoiceRow) => void;
}) {
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [hasCustomer, setHasCustomer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadBalance = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/admin/invoices/${invoice.id}/apply-credit`, {
      cache: "no-store",
    });
    if (!response.ok) {
      // 403 etc. — silently hide the panel by leaving balance null.
      return;
    }
    const data = (await response.json()) as { balanceCents: number; hasCustomer: boolean };
    setBalanceCents(data.balanceCents);
    setHasCustomer(data.hasCustomer);
  }, [invoice.id]);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  const handleApply = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/invoices/${invoice.id}/apply-credit`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error || "Unable to apply account credit.");
        return;
      }
      setNotice(
        `Applied ${formatCurrency(data.appliedCents, invoice.currency)}. Remaining credit: ${formatCurrency(data.newBalanceCents, invoice.currency)}.`,
      );
      setBalanceCents(data.newBalanceCents);
      if (data.invoice) {
        onApplied(data.invoice as InvoiceRow);
      }
    } finally {
      setBusy(false);
    }
  }, [invoice.id, invoice.currency, onApplied]);

  // Nothing to show until we know there is a linked customer with credit.
  if (balanceCents === null || !hasCustomer) {
    return null;
  }

  return (
    <AdminCard ghost className="invoice-dialog-section">
      <h3 className="manual-section-title">Account Credit</h3>
      <p className="helper-text">
        Available balance: <strong>{formatCurrency(balanceCents, invoice.currency)}</strong>
      </p>
      {error ? <p className="helper-text error-text">{error}</p> : null}
      {notice ? <p className="helper-text">{notice}</p> : null}
      <div className="button-row">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !canApply || balanceCents <= 0}
          onClick={handleApply}
        >
          {busy ? "Applying…" : "Apply account credit"}
        </button>
      </div>
      {!canApply ? (
        <p className="helper-text">Account credit can only be applied to draft or sent invoices.</p>
      ) : null}
    </AdminCard>
  );
}
