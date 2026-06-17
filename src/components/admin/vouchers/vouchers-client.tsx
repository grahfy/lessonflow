"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminTable } from "@/components/admin/ui/admin-table";
import { AdminTableSkeleton } from "@/components/admin/ui/admin-table-skeleton";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency, parseMoneyInputToCents } from "@/lib/invoices/currency";
import { useCustomers } from "@/lib/admin/use-customers";
import { useVouchers, type VoucherStatus } from "@/lib/admin/use-vouchers";

const STATUS_LABELS: Record<VoucherStatus, string> = {
  pending: "Pending payment",
  active: "Active",
  redeemed: "Redeemed",
  void: "Void",
};

/**
 * Owner-only admin surface for gift vouchers: issue complimentary vouchers,
 * review all vouchers with status, void unredeemed vouchers, and redeem a code
 * directly into a customer's account credit. Mirrors the existing admin CRUD
 * pattern (AdminShell + AdminTable + AdminCard + safe-fetch hook).
 */
export function VouchersClient({ defaultCurrency }: { defaultCurrency: string }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const onAuthError = useCallback(() => window.location.assign("/admin/login"), []);
  const { vouchers, loading, load, issue, voidVoucher, revealCode, redeemToCustomer } = useVouchers(
    onAuthError,
    setError,
  );

  // Revealed full codes, keyed by voucher id. Codes are masked in the list
  // (bearer credential); admins reveal one on demand via the detail endpoint.
  const [revealedCodes, setRevealedCodes] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const handleReveal = useCallback(
    async (id: string) => {
      setError("");
      setRevealingId(id);
      try {
        const code = await revealCode(id);
        if (code) {
          setRevealedCodes((current) => ({ ...current, [id]: code }));
        }
      } finally {
        setRevealingId(null);
      }
    },
    [revealCode],
  );

  // Customer lookup for the redeem form. Reuses the shared admin customer
  // search so admins pick a customer by name/email instead of pasting a CUID.
  const { customers: customerMatches, loading: customerSearching, load: searchCustomers } =
    useCustomers({ pageSize: 20, onAuthError, onError: setError });

  // Issue comp voucher form state.
  const [issueAmount, setIssueAmount] = useState("");
  const [issueRecipientName, setIssueRecipientName] = useState("");
  const [issueRecipientEmail, setIssueRecipientEmail] = useState("");
  const [issueNote, setIssueNote] = useState("");
  const [issuing, setIssuing] = useState(false);

  // Redeem-to-customer form state.
  const [redeemCode, setRedeemCode] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [redeemCustomerId, setRedeemCustomerId] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const [pendingVoid, setPendingVoid] = useState<string | null>(null);
  // Confirmation gates for the two money-moving actions. Issuing mints a free
  // voucher; redeeming moves a voucher's value into a customer's account credit
  // (both irreversible), so each is staged behind a ConfirmDialog.
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [confirmRedeem, setConfirmRedeem] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced customer search: only query once the admin has typed something so
  // we don't pull the full customer list on mount.
  useEffect(() => {
    const term = customerQuery.trim();
    if (!term) {
      return;
    }
    const handle = window.setTimeout(() => {
      void searchCustomers(term);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [customerQuery, searchCustomers]);

  // The currently selected customer (if still present in the latest results),
  // surfaced so the admin confirms a name rather than a raw id before redeeming.
  const selectedCustomer = useMemo(
    () => customerMatches.find((c) => c.id === redeemCustomerId) ?? null,
    [customerMatches, redeemCustomerId],
  );

  // Parsed issue amount, surfaced both for confirm copy and as a validity gate
  // before the confirmation dialog opens.
  const issueAmountCents = useMemo(
    () => parseMoneyInputToCents(issueAmount, defaultCurrency).cents,
    [issueAmount, defaultCurrency],
  );

  // Validate before opening the confirm so invalid input gives immediate
  // feedback rather than a dialog that fails on confirm.
  const requestIssue = useCallback(() => {
    setError("");
    setNotice("");
    if (issueAmountCents === null || issueAmountCents <= 0) {
      setError("Enter a valid voucher amount.");
      return;
    }
    setConfirmIssue(true);
  }, [issueAmountCents]);

  const handleIssue = useCallback(async () => {
    // Guard against a re-fired confirm minting a duplicate comp voucher: bail if
    // a request is already in flight.
    if (issuing) {
      return;
    }
    setError("");
    setNotice("");
    const parsedAmount = parseMoneyInputToCents(issueAmount, defaultCurrency);
    if (parsedAmount.cents === null || parsedAmount.cents <= 0) {
      setError("Enter a valid voucher amount.");
      return;
    }
    setIssuing(true);
    try {
      const created = await issue({
        valueCents: parsedAmount.cents,
        recipientName: issueRecipientName.trim() || undefined,
        recipientEmail: issueRecipientEmail.trim() || undefined,
        note: issueNote.trim() || undefined,
      });
      if (created) {
        setNotice(`Issued voucher ${created.code} for ${formatCurrency(created.valueCents, created.currency)}.`);
        setIssueAmount("");
        setIssueRecipientName("");
        setIssueRecipientEmail("");
        setIssueNote("");
      }
    } finally {
      setIssuing(false);
    }
  }, [issue, issuing, issueAmount, issueRecipientName, issueRecipientEmail, issueNote, defaultCurrency]);

  const handleRedeem = useCallback(async () => {
    // Guard against a re-fired confirm double-applying credit.
    if (redeeming) {
      return;
    }
    setError("");
    setNotice("");
    if (!redeemCode.trim() || !redeemCustomerId.trim()) {
      setError("Enter a voucher code and select a customer.");
      return;
    }
    setRedeeming(true);
    try {
      const result = await redeemToCustomer(redeemCode.trim(), redeemCustomerId.trim());
      if (result) {
        setNotice(
          `Redeemed ${formatCurrency(result.valueCents, defaultCurrency)}. New account credit balance: ${formatCurrency(result.newBalanceCents, defaultCurrency)}.`,
        );
        setRedeemCode("");
        setCustomerQuery("");
        setRedeemCustomerId("");
      }
    } finally {
      setRedeeming(false);
    }
  }, [redeemToCustomer, redeeming, redeemCode, redeemCustomerId, defaultCurrency]);

  // Validate before opening the redeem confirm, mirroring requestIssue.
  const requestRedeem = useCallback(() => {
    setError("");
    setNotice("");
    if (!redeemCode.trim() || !redeemCustomerId.trim()) {
      setError("Enter a voucher code and select a customer.");
      return;
    }
    setConfirmRedeem(true);
  }, [redeemCode, redeemCustomerId]);

  const rows = useMemo(() => vouchers, [vouchers]);

  return (
    <AdminShell title="Vouchers" error={error} notice={notice} loading={loading && rows.length === 0}>
      <AdminCard>
        <h3>Issue a complimentary voucher</h3>
        <p className="helper-text">
          Creates an active voucher with no payment. Share the code with the
          recipient; it can be redeemed for account credit.
        </p>
        <AdminForm>
          <AdminField label="Amount" htmlFor="voucher-issue-amount" required>
            <input
              id="voucher-issue-amount"
              type="text"
              inputMode="decimal"
              value={issueAmount}
              onChange={(event) => setIssueAmount(event.target.value)}
              placeholder="e.g. 100"
            />
          </AdminField>
          <AdminField label="Recipient name" htmlFor="voucher-issue-recipient-name">
            <input
              id="voucher-issue-recipient-name"
              type="text"
              value={issueRecipientName}
              onChange={(event) => setIssueRecipientName(event.target.value)}
            />
          </AdminField>
          <AdminField label="Recipient email" htmlFor="voucher-issue-recipient-email">
            <input
              id="voucher-issue-recipient-email"
              type="email"
              value={issueRecipientEmail}
              onChange={(event) => setIssueRecipientEmail(event.target.value)}
            />
          </AdminField>
          <AdminField label="Note" htmlFor="voucher-issue-note" fullWidth>
            <input
              id="voucher-issue-note"
              type="text"
              value={issueNote}
              onChange={(event) => setIssueNote(event.target.value)}
            />
          </AdminField>
        </AdminForm>
        <div className="button-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={requestIssue}
            disabled={issuing || issueAmountCents === null || issueAmountCents <= 0}
          >
            {issuing ? "Issuing…" : "Issue voucher"}
          </button>
        </div>
      </AdminCard>

      <AdminCard>
        <h3>Redeem a voucher to a customer</h3>
        <p className="helper-text">
          Applies a voucher&apos;s value to a customer&apos;s account credit.
          Search for the customer by name or email, then confirm the match below.
        </p>
        <AdminForm>
          <AdminField label="Voucher code" htmlFor="voucher-redeem-code" required>
            <input
              id="voucher-redeem-code"
              type="text"
              value={redeemCode}
              onChange={(event) => setRedeemCode(event.target.value)}
              autoCapitalize="characters"
            />
          </AdminField>
          <AdminField
            label="Find customer"
            htmlFor="voucher-redeem-customer-search"
            tooltip="Search existing customers by name or email."
          >
            <input
              id="voucher-redeem-customer-search"
              type="text"
              value={customerQuery}
              onChange={(event) => {
                setCustomerQuery(event.target.value);
                // Clear any prior selection while the search term changes so a
                // stale id can't be submitted against a new query.
                setRedeemCustomerId("");
              }}
              placeholder="Filter by name or email…"
              autoComplete="off"
            />
          </AdminField>
          <AdminField label="Select customer" htmlFor="voucher-redeem-customer" required>
            <select
              id="voucher-redeem-customer"
              value={redeemCustomerId}
              onChange={(event) => setRedeemCustomerId(event.target.value)}
              disabled={customerMatches.length === 0}
            >
              <option value="">
                {customerSearching
                  ? "Searching…"
                  : customerQuery.trim() && customerMatches.length === 0
                    ? "No matching customers"
                    : "— Choose a customer —"}
              </option>
              {customerMatches.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.fullName} · {customer.email}
                </option>
              ))}
            </select>
          </AdminField>
          {selectedCustomer ? (
            <p className="helper-text" aria-live="polite">
              Redeeming to <strong>{selectedCustomer.fullName}</strong> (
              {selectedCustomer.email}).
            </p>
          ) : null}
        </AdminForm>
        <div className="button-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={requestRedeem}
            disabled={redeeming || !redeemCode.trim() || !redeemCustomerId}
          >
            {redeeming ? "Redeeming…" : "Redeem to account credit"}
          </button>
        </div>
      </AdminCard>

      <AdminTable
        loading={loading && rows.length === 0}
        loadingSkeleton={<AdminTableSkeleton columns={["18%", "12%", "14%", "1fr", "12%"]} rows={6} />}
        emptyLabel="No vouchers yet."
        header={
          <div className="admin-table-row admin-table-head">
            <span>Code</span>
            <span>Value</span>
            <span>Status</span>
            <span>Recipient</span>
            <span>Actions</span>
          </div>
        }
      >
        {rows.map((voucher) => {
          const canVoid = voucher.status === "pending" || voucher.status === "active";
          const revealed = revealedCodes[voucher.id];
          return (
            <div key={voucher.id} className="admin-table-row">
              <span className="admin-code-cell voucher-code-cell">
                {revealed ?? voucher.codeMasked}
                {revealed ? null : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => void handleReveal(voucher.id)}
                    disabled={revealingId === voucher.id}
                  >
                    {revealingId === voucher.id ? "Revealing…" : "Reveal"}
                  </button>
                )}
              </span>
              <span>{formatCurrency(voucher.valueCents, voucher.currency)}</span>
              <span>{STATUS_LABELS[voucher.status]}</span>
              <span>
                {voucher.recipientName || voucher.recipientEmail || "—"}
              </span>
              <span>
                {canVoid ? (
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setPendingVoid(voucher.id)}
                  >
                    Void
                  </button>
                ) : (
                  "—"
                )}
              </span>
            </div>
          );
        })}
      </AdminTable>

      <ConfirmDialog
        open={pendingVoid !== null}
        title="Void voucher"
        description="Voiding prevents this voucher from being redeemed. This cannot be undone."
        confirmLabel="Void"
        destructive
        onConfirm={() => {
          const id = pendingVoid;
          setPendingVoid(null);
          if (id) {
            void voidVoucher(id);
          }
        }}
        onCancel={() => setPendingVoid(null)}
      />

      <ConfirmDialog
        open={confirmIssue}
        title="Issue complimentary voucher"
        description={
          issueAmountCents !== null && issueAmountCents > 0
            ? `This creates a complimentary voucher worth ${formatCurrency(issueAmountCents, defaultCurrency)} with no payment. The code can be redeemed for account credit.`
            : "This creates a complimentary voucher with no payment."
        }
        confirmLabel="Issue voucher"
        onConfirm={() => {
          setConfirmIssue(false);
          void handleIssue();
        }}
        onCancel={() => setConfirmIssue(false)}
      />

      <ConfirmDialog
        open={confirmRedeem}
        title="Redeem voucher to account credit"
        description={
          selectedCustomer
            ? `This moves the voucher's full value into ${selectedCustomer.fullName}'s account credit and cannot be undone.`
            : "This moves the voucher's full value into the customer's account credit and cannot be undone."
        }
        confirmLabel="Redeem to account credit"
        onConfirm={() => {
          setConfirmRedeem(false);
          void handleRedeem();
        }}
        onCancel={() => setConfirmRedeem(false)}
      />
    </AdminShell>
  );
}
